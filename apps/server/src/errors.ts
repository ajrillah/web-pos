/** Error thrown by services; mapped to `{ error: { code, message } }` by the error handler. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Error that stops the server from starting. `message` is shown to the user as is. */
export class StartupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StartupError';
  }
}

export const errorMessages = {
  notFound: 'Alamat tidak ditemukan.',
  validation: 'Data tidak valid.',
  badRequest: 'Permintaan tidak valid.',
  payloadTooLarge: 'Data yang dikirim terlalu besar.',
  unsupportedMediaType: 'Jenis data tidak didukung.',
  forbiddenHost: 'Akses hanya diizinkan dari komputer ini.',
  internal: 'Terjadi kesalahan pada server. Silakan coba lagi.',
} as const;

export function validationMessage(field: string | undefined): string {
  return field ? `Data tidak valid pada kolom "${field}".` : errorMessages.validation;
}

export function portInUseMessage(port: number): string {
  return `Port ${port} sudah dipakai aplikasi lain. Tutup aplikasi tersebut atau ubah "port" di config.json, lalu jalankan ulang TOKO PODOMORO.`;
}

export function invalidConfigMessage(file: string): string {
  return `File konfigurasi tidak valid: ${file}. Perbaiki isinya atau hapus file tersebut agar dibuat ulang.`;
}
