import { APPROVAL_HEADER, apiErrorSchema } from '@toko-podomoro/shared';
import type { z } from 'zod';

/** Error from /api with the server's code and Indonesian message, ready to show to the user. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const NETWORK_MESSAGE = 'Server tidak dapat dihubungi. Pastikan aplikasi TOKO PODOMORO berjalan.';
const UNEXPECTED_MESSAGE = 'Terjadi kesalahan. Silakan coba lagi.';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Fired when the server says the session is locked (another tab, or the idle timer). */
export const SESSION_LOCKED_EVENT = 'toko:session-locked';

// The menu approval of the PIN menu the cashier is in (Pengguna, Profil Toko, Laporan, Impor).
let menuApprovalToken: string | null = null;

/** Set while a cashier is inside a PIN menu; sent with every request until cleared. */
export function setMenuApprovalToken(token: string | null): void {
  menuApprovalToken = token;
}

export interface RequestOptions {
  /** Single-use owner approval for this request (voids, price changes, ...). */
  approvalToken?: string | undefined;
}

/** Calls /api with JSON and the session cookie; validates the response with `schema`. */
export async function apiRequest<T>(
  method: Method,
  path: string,
  schema: z.ZodType<T> | null,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const approval = options.approvalToken ?? menuApprovalToken;
  if (approval) headers[APPROVAL_HEADER] = approval;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', NETWORK_MESSAGE);
  }
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(await res.json().catch(() => null));
    if (parsed.success && parsed.data.error.code === 'SESSION_LOCKED') {
      window.dispatchEvent(new Event(SESSION_LOCKED_EVENT));
    }
    throw parsed.success
      ? new ApiRequestError(res.status, parsed.data.error.code, parsed.data.error.message)
      : new ApiRequestError(res.status, 'UNEXPECTED_RESPONSE', UNEXPECTED_MESSAGE);
  }
  if (schema === null) {
    return undefined as T;
  }
  return schema.parse(await res.json());
}

/**
 * Downloads a file from /api (with the approval header, unlike a plain link) and hands it to
 * the browser to save under the server's file name.
 */
export async function apiDownload(path: string): Promise<string> {
  const headers: Record<string, string> = {};
  if (menuApprovalToken) headers[APPROVAL_HEADER] = menuApprovalToken;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { credentials: 'same-origin', headers });
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', NETWORK_MESSAGE);
  }
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(await res.json().catch(() => null));
    throw parsed.success
      ? new ApiRequestError(res.status, parsed.data.error.code, parsed.data.error.message)
      : new ApiRequestError(res.status, 'UNEXPECTED_RESPONSE', UNEXPECTED_MESSAGE);
  }
  const fileName =
    /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'laporan';
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return fileName;
}

/** Message to show for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  // Errors raised on purpose in the UI (e.g. a cancelled owner approval) carry their message.
  if (error instanceof Error && error.name === 'ApprovalCancelled') return error.message;
  return UNEXPECTED_MESSAGE;
}
