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

/** Business errors raised by services. Messages are Indonesian and shown to the user as is. */
export const appErrors = {
  unauthenticated: () => new AppError(401, 'UNAUTHENTICATED', 'Silakan masuk terlebih dahulu.'),
  invalidCredentials: () =>
    new AppError(401, 'INVALID_CREDENTIALS', 'Nama pengguna atau PIN salah.'),
  setupAlreadyDone: () =>
    new AppError(409, 'SETUP_ALREADY_DONE', 'Pengaturan awal sudah dilakukan.'),
  pinChangeRequired: () =>
    new AppError(403, 'PIN_CHANGE_REQUIRED', 'Anda harus mengganti PIN terlebih dahulu.'),
  ownerApprovalRequired: () =>
    new AppError(403, 'OWNER_APPROVAL_REQUIRED', 'Tindakan ini memerlukan persetujuan pemilik.'),
  wrongCurrentPin: () => new AppError(400, 'WRONG_CURRENT_PIN', 'PIN saat ini salah.'),
  invalidRecovery: () =>
    new AppError(400, 'INVALID_RECOVERY', 'Nama pengguna atau kode pemulihan salah.'),
  usernameTaken: () => new AppError(409, 'USERNAME_TAKEN', 'Nama pengguna sudah dipakai.'),
  userNotFound: () => new AppError(404, 'USER_NOT_FOUND', 'Pengguna tidak ditemukan.'),
  lastActiveOwner: () =>
    new AppError(409, 'LAST_ACTIVE_OWNER', 'Pemilik aktif terakhir tidak dapat dinonaktifkan.'),
  cannotDeactivateSelf: () =>
    new AppError(409, 'CANNOT_DEACTIVATE_SELF', 'Anda tidak dapat menonaktifkan akun sendiri.'),
  ownerPinResetForbidden: () =>
    new AppError(
      403,
      'OWNER_PIN_RESET_FORBIDDEN',
      'PIN pemilik hanya dapat diatur ulang oleh pemilik itu sendiri dengan kode pemulihan.',
    ),
  categoryNotFound: () => new AppError(404, 'CATEGORY_NOT_FOUND', 'Kategori tidak ditemukan.'),
  categoryInactive: () =>
    new AppError(400, 'CATEGORY_INACTIVE', 'Kategori nonaktif tidak dapat dipilih.'),
  categoryNameTaken: () => new AppError(409, 'CATEGORY_NAME_TAKEN', 'Nama kategori sudah dipakai.'),
  defaultCategoryLocked: () =>
    new AppError(409, 'DEFAULT_CATEGORY_LOCKED', 'Kategori bawaan tidak dapat dinonaktifkan.'),
  productNotFound: () => new AppError(404, 'PRODUCT_NOT_FOUND', 'Barang tidak ditemukan.'),
  productCodeTaken: () =>
    new AppError(
      409,
      'PRODUCT_CODE_TAKEN',
      'Kode barang sudah dipakai, termasuk oleh barang nonaktif.',
    ),
  stockUnitLocked: () =>
    new AppError(
      409,
      'STOCK_UNIT_LOCKED',
      'Jenis barang dan satuan stok tidak dapat diubah karena barang ini sudah punya riwayat stok. Nonaktifkan barang ini, lalu buat barang baru.',
    ),
  /** Unit rows break a rule; `message` says which. */
  invalidUnits: (message: string) => new AppError(400, 'INVALID_UNITS', message),
};

export function validationMessage(field: string | undefined): string {
  return field ? `Data tidak valid pada kolom "${field}".` : errorMessages.validation;
}

export function portInUseMessage(port: number): string {
  return `Port ${port} sudah dipakai aplikasi lain. Tutup aplikasi tersebut atau ubah "port" di config.json, lalu jalankan ulang TOKO PODOMORO.`;
}

export function invalidConfigMessage(file: string): string {
  return `File konfigurasi tidak valid: ${file}. Perbaiki isinya atau hapus file tersebut agar dibuat ulang.`;
}
