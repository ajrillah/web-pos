import {
  type AdjustmentsQuery,
  type ApproveRequest,
  adjustmentsResponseSchema,
  approveResponseSchema,
  type ChangePinRequest,
  type CreateAdjustmentRequest,
  type CreateCategoryRequest,
  type CreateCustomerPaymentRequest,
  type CreateCustomerRequest,
  type CreateProductRequest,
  type CreatePurchaseRequest,
  type CreateSaleRequest,
  type CreateSupplierPaymentRequest,
  type CreateSupplierRequest,
  type CreateUserRequest,
  type CustomersQuery,
  categoriesResponseSchema,
  categoryResponseSchema,
  changePinResponseSchema,
  completeOpnameResponseSchema,
  costSuggestionResponseSchema,
  createAdjustmentResponseSchema,
  createSaleResponseSchema,
  customerLedgerResponseSchema,
  customerPaymentResponseSchema,
  customerResponseSchema,
  customersResponseSchema,
  deletedCountResponseSchema,
  type ExportFormat,
  type HoldSaleRequest,
  healthResponseSchema,
  heldSalesResponseSchema,
  type ImportRequest,
  importCommitResponseSchema,
  importPreviewResponseSchema,
  type LoginRequest,
  loginUsersResponseSchema,
  type MovementsQuery,
  meResponseSchema,
  movementsResponseSchema,
  type OpnamesQuery,
  opnameResponseSchema,
  opnamesResponseSchema,
  type PayablesQuery,
  type ProductsQuery,
  type PurchasesQuery,
  payablesResponseSchema,
  productResponseSchema,
  productsResponseSchema,
  purchaseResponseSchema,
  purchasesResponseSchema,
  type ReceivablesQuery,
  type RecoverRequest,
  type ReportQuery,
  type ReportResponse,
  type ReportType,
  receiptSavedResponseSchema,
  receivablesResponseSchema,
  recoveryCodeResponseSchema,
  reportResponseSchemas,
  restoreResponseSchema,
  resumeHeldSaleResponseSchema,
  type SalesQuery,
  type SetupRequest,
  type SuppliersQuery,
  type SupplierVoidRequest,
  saleResponseSchema,
  salesResponseSchema,
  settingsResponseSchema,
  setupStatusResponseSchema,
  supplierLedgerResponseSchema,
  supplierPaymentResponseSchema,
  supplierResponseSchema,
  suppliersResponseSchema,
  type UnlockRequest,
  type UpdateCategoryRequest,
  type UpdateCustomerRequest,
  type UpdateOpnameItemsRequest,
  type UpdateProductRequest,
  type UpdateSettingsRequest,
  type UpdateSupplierRequest,
  type UpdateUserRequest,
  userResponseSchema,
  usersResponseSchema,
  type VoidRequest,
  voidPurchaseResponseSchema,
} from '@toko-podomoro/shared';
import type { z } from 'zod';
import { apiDownload, apiRequest, apiUpload } from './client';

export const api = {
  setupStatus: () => apiRequest('GET', '/setup/status', setupStatusResponseSchema),
  setup: (body: SetupRequest) => apiRequest('POST', '/setup', recoveryCodeResponseSchema, body),
  login: (body: LoginRequest) => apiRequest('POST', '/auth/login', meResponseSchema, body),
  logout: () => apiRequest('POST', '/auth/logout', null),
  me: () => apiRequest('GET', '/auth/me', meResponseSchema),
  loginUsers: () => apiRequest('GET', '/auth/users', loginUsersResponseSchema),
  lock: () => apiRequest('POST', '/auth/lock', null),
  unlock: (body: UnlockRequest) => apiRequest('POST', '/auth/unlock', meResponseSchema, body),
  approve: (body: ApproveRequest) =>
    apiRequest('POST', '/auth/approve', approveResponseSchema, body),
  releaseApproval: (token: string) => apiRequest('POST', '/auth/approve/release', null, { token }),
  updateSettings: (body: UpdateSettingsRequest) =>
    apiRequest('PUT', '/settings', settingsResponseSchema, body),
  changePin: (body: ChangePinRequest) =>
    apiRequest('PUT', '/auth/me/pin', changePinResponseSchema, body),
  recover: (body: RecoverRequest) =>
    apiRequest('POST', '/auth/recover', recoveryCodeResponseSchema, body),
  listUsers: () => apiRequest('GET', '/users', usersResponseSchema),
  createUser: (body: CreateUserRequest) => apiRequest('POST', '/users', userResponseSchema, body),
  updateUser: (id: string, body: UpdateUserRequest) =>
    apiRequest('PUT', `/users/${encodeURIComponent(id)}`, userResponseSchema, body),

  listCategories: () => apiRequest('GET', '/categories', categoriesResponseSchema),
  createCategory: (body: CreateCategoryRequest, approvalToken?: string) =>
    apiRequest('POST', '/categories', categoryResponseSchema, body, { approvalToken }),
  updateCategory: (id: string, body: UpdateCategoryRequest, approvalToken?: string) =>
    apiRequest('PUT', `/categories/${encodeURIComponent(id)}`, categoryResponseSchema, body, {
      approvalToken,
    }),

  listProducts: (query: ProductsQuery) =>
    apiRequest('GET', `/products?${toSearchParams(query)}`, productsResponseSchema),
  getProduct: (id: string) =>
    apiRequest('GET', `/products/${encodeURIComponent(id)}`, productResponseSchema),
  createProduct: (body: CreateProductRequest) =>
    apiRequest('POST', '/products', productResponseSchema, body),
  updateProduct: (id: string, body: UpdateProductRequest, approvalToken?: string) =>
    apiRequest('PUT', `/products/${encodeURIComponent(id)}`, productResponseSchema, body, {
      approvalToken,
    }),
  productByCode: (code: string) =>
    apiRequest('GET', `/products/by-code/${encodeURIComponent(code)}`, productResponseSchema),
  setProductActive: (id: string, active: boolean, approvalToken?: string) =>
    apiRequest(
      'PATCH',
      `/products/${encodeURIComponent(id)}/active`,
      productResponseSchema,
      { active },
      { approvalToken },
    ),

  settings: () => apiRequest('GET', '/settings', settingsResponseSchema),

  createSale: (body: CreateSaleRequest) =>
    apiRequest('POST', '/sales', createSaleResponseSchema, body),
  getSale: (id: string) =>
    apiRequest('GET', `/sales/${encodeURIComponent(id)}`, saleResponseSchema),
  listSales: (query: SalesQuery) =>
    apiRequest('GET', `/sales?${toSearchParams(query)}`, salesResponseSchema),
  holdSale: (body: HoldSaleRequest) => apiRequest('POST', '/sales/held', saleResponseSchema, body),
  listHeldSales: () => apiRequest('GET', '/sales/held', heldSalesResponseSchema),
  resumeHeldSale: (id: string) =>
    apiRequest(
      'POST',
      `/sales/held/${encodeURIComponent(id)}/resume`,
      resumeHeldSaleResponseSchema,
    ),
  deleteHeldSale: (id: string) =>
    apiRequest('DELETE', `/sales/held/${encodeURIComponent(id)}`, deletedCountResponseSchema),
  deleteHeldSalesBefore: (day: string) =>
    apiRequest(
      'DELETE',
      `/sales/held?${toSearchParams({ before: day })}`,
      deletedCountResponseSchema,
    ),
  heldDraftUrl: (id: string) => `/api/sales/held/${encodeURIComponent(id)}/receipt.pdf`,
  openReceiptFolder: () => apiRequest('POST', '/receipts/open-folder', null),

  listCustomers: (query: CustomersQuery) =>
    apiRequest('GET', `/customers?${toSearchParams(query)}`, customersResponseSchema),
  getCustomer: (id: string) =>
    apiRequest('GET', `/customers/${encodeURIComponent(id)}`, customerResponseSchema),
  createCustomer: (body: CreateCustomerRequest) =>
    apiRequest('POST', '/customers', customerResponseSchema, body),
  updateCustomer: (id: string, body: UpdateCustomerRequest) =>
    apiRequest('PUT', `/customers/${encodeURIComponent(id)}`, customerResponseSchema, body),
  customerLedger: (id: string) =>
    apiRequest('GET', `/customers/${encodeURIComponent(id)}/ledger`, customerLedgerResponseSchema),
  listReceivables: (query: ReceivablesQuery) =>
    apiRequest('GET', `/receivables?${toSearchParams(query)}`, receivablesResponseSchema),
  createCustomerPayment: (body: CreateCustomerPaymentRequest) =>
    apiRequest('POST', '/customer-payments', customerPaymentResponseSchema, body),
  voidSale: (id: string, body: VoidRequest, approvalToken?: string) =>
    apiRequest('POST', `/sales/${encodeURIComponent(id)}/void`, saleResponseSchema, body, {
      approvalToken,
    }),
  voidCustomerPayment: (id: string, body: VoidRequest, approvalToken?: string) =>
    apiRequest(
      'POST',
      `/customer-payments/${encodeURIComponent(id)}/void`,
      customerPaymentResponseSchema,
      body,
      { approvalToken },
    ),
  getCustomerPayment: (id: string) =>
    apiRequest(
      'GET',
      `/customer-payments/${encodeURIComponent(id)}`,
      customerPaymentResponseSchema,
    ),

  listSuppliers: (query: SuppliersQuery) =>
    apiRequest('GET', `/suppliers?${toSearchParams(query)}`, suppliersResponseSchema),
  createSupplier: (body: CreateSupplierRequest) =>
    apiRequest('POST', '/suppliers', supplierResponseSchema, body),
  updateSupplier: (id: string, body: UpdateSupplierRequest) =>
    apiRequest('PUT', `/suppliers/${encodeURIComponent(id)}`, supplierResponseSchema, body),
  supplierLedger: (id: string) =>
    apiRequest('GET', `/suppliers/${encodeURIComponent(id)}/ledger`, supplierLedgerResponseSchema),
  listPayables: (query: PayablesQuery) =>
    apiRequest('GET', `/payables?${toSearchParams(query)}`, payablesResponseSchema),
  listPurchases: (query: PurchasesQuery) =>
    apiRequest('GET', `/purchases?${toSearchParams(query)}`, purchasesResponseSchema),
  getPurchase: (id: string) =>
    apiRequest('GET', `/purchases/${encodeURIComponent(id)}`, purchaseResponseSchema),
  createPurchase: (body: CreatePurchaseRequest, approvalToken?: string) =>
    apiRequest('POST', '/purchases', purchaseResponseSchema, body, { approvalToken }),
  voidPurchase: (id: string, body: SupplierVoidRequest, approvalToken?: string) =>
    apiRequest(
      'POST',
      `/purchases/${encodeURIComponent(id)}/void`,
      voidPurchaseResponseSchema,
      body,
      { approvalToken },
    ),
  costSuggestion: (productId: string) =>
    apiRequest(
      'GET',
      `/purchases/cost-suggestion?${toSearchParams({ productId })}`,
      costSuggestionResponseSchema,
    ),
  createSupplierPayment: (body: CreateSupplierPaymentRequest) =>
    apiRequest('POST', '/supplier-payments', supplierPaymentResponseSchema, body),
  getSupplierPayment: (id: string) =>
    apiRequest(
      'GET',
      `/supplier-payments/${encodeURIComponent(id)}`,
      supplierPaymentResponseSchema,
    ),
  voidSupplierPayment: (id: string, body: SupplierVoidRequest, approvalToken?: string) =>
    apiRequest(
      'POST',
      `/supplier-payments/${encodeURIComponent(id)}/void`,
      supplierPaymentResponseSchema,
      body,
      { approvalToken },
    ),

  listAdjustments: (query: AdjustmentsQuery) =>
    apiRequest('GET', `/stock-adjustments?${toSearchParams(query)}`, adjustmentsResponseSchema),
  createAdjustment: (body: CreateAdjustmentRequest) =>
    apiRequest('POST', '/stock-adjustments', createAdjustmentResponseSchema, body),
  listOpnames: (query: OpnamesQuery) =>
    apiRequest('GET', `/stock-opname?${toSearchParams(query)}`, opnamesResponseSchema),
  getOpname: (id: string) =>
    apiRequest('GET', `/stock-opname/${encodeURIComponent(id)}`, opnameResponseSchema),
  startOpname: (categoryId: string) =>
    apiRequest('POST', '/stock-opname', opnameResponseSchema, { categoryId }),
  updateOpnameItems: (id: string, body: UpdateOpnameItemsRequest) =>
    apiRequest('PUT', `/stock-opname/${encodeURIComponent(id)}/items`, opnameResponseSchema, body),
  completeOpname: (id: string) =>
    apiRequest(
      'POST',
      `/stock-opname/${encodeURIComponent(id)}/complete`,
      completeOpnameResponseSchema,
    ),
  cancelOpname: (id: string) =>
    apiRequest('POST', `/stock-opname/${encodeURIComponent(id)}/cancel`, opnameResponseSchema),
  listMovements: (query: MovementsQuery) =>
    apiRequest('GET', `/stock-movements?${toSearchParams(query)}`, movementsResponseSchema),
};

/** Laporan: one report as JSON, or saved as PDF / Excel. */
export const reports = {
  get: <T extends ReportType>(type: T, query: ReportQuery<T>) =>
    apiRequest(
      'GET',
      `/reports/${type}?${toSearchParams(query)}`,
      reportResponseSchemas[type] as unknown as z.ZodType<ReportResponse<T>>,
    ),
  download: <T extends ReportType>(type: T, format: ExportFormat, query: ReportQuery<T>) =>
    apiDownload(`/reports/${type}/export?${toSearchParams({ ...query, format })}`),
};

/** Barang > Impor (PIN menu `impor` for cashiers; the menu token is sent automatically). */
export const productImport = {
  downloadTemplate: () => apiDownload('/products/import/template'),
  preview: (body: ImportRequest) =>
    apiRequest('POST', '/products/import/preview', importPreviewResponseSchema, body),
  commit: (body: ImportRequest) =>
    apiRequest('POST', '/products/import', importCommitResponseSchema, body),
};

/** Server version (Pengaturan footer). */
export const health = () => apiRequest('GET', '/health', healthResponseSchema);

/** Pengaturan > Cadangan Data (owners only). */
export const dataBackup = {
  download: () => apiDownload('/backup'),
  restore: (file: Blob) => apiUpload('/restore', file, 'application/zip', restoreResponseSchema),
};

export type ReceiptKind = 'sale' | 'payment';

const receiptBase = (kind: ReceiptKind, id: string) =>
  `/${kind === 'sale' ? 'sales' : 'customer-payments'}/${encodeURIComponent(id)}`;

/** Receipt actions shared by sale receipts (nota) and payment receipts (bukti bayar). */
export const receipts = {
  save: (kind: ReceiptKind, id: string) =>
    apiRequest('POST', `${receiptBase(kind, id)}/receipt`, receiptSavedResponseSchema),
  open: (kind: ReceiptKind, id: string) =>
    apiRequest('POST', `${receiptBase(kind, id)}/receipt/open`, null),
  downloadUrl: (kind: ReceiptKind, id: string) => `/api${receiptBase(kind, id)}/receipt.pdf`,
};

/** Query string from defined, non-empty values. */
function toSearchParams(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}
