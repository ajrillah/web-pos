import { apiErrorSchema } from '@toko-podomoro/shared';
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

/** Calls /api with JSON and the session cookie; validates the response with `schema`. */
export async function apiRequest<T>(
  method: Method,
  path: string,
  schema: z.ZodType<T> | null,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', NETWORK_MESSAGE);
  }
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(await res.json().catch(() => null));
    throw parsed.success
      ? new ApiRequestError(res.status, parsed.data.error.code, parsed.data.error.message)
      : new ApiRequestError(res.status, 'UNEXPECTED_RESPONSE', UNEXPECTED_MESSAGE);
  }
  if (schema === null) {
    return undefined as T;
  }
  return schema.parse(await res.json());
}

/** Message to show for any thrown value. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : UNEXPECTED_MESSAGE;
}
