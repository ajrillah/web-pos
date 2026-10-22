import {
  type ChangePinRequest,
  type CreateCategoryRequest,
  type CreateProductRequest,
  type CreateSaleRequest,
  type CreateUserRequest,
  categoriesResponseSchema,
  categoryResponseSchema,
  changePinResponseSchema,
  createSaleResponseSchema,
  deletedCountResponseSchema,
  type HoldSaleRequest,
  heldSalesResponseSchema,
  type LoginRequest,
  meResponseSchema,
  type ProductsQuery,
  productResponseSchema,
  productsResponseSchema,
  type RecoverRequest,
  receiptSavedResponseSchema,
  recoveryCodeResponseSchema,
  resumeHeldSaleResponseSchema,
  type SalesQuery,
  type SetupRequest,
  saleResponseSchema,
  salesResponseSchema,
  settingsResponseSchema,
  setupStatusResponseSchema,
  type UpdateCategoryRequest,
  type UpdateProductRequest,
  type UpdateUserRequest,
  userResponseSchema,
  usersResponseSchema,
} from '@toko-podomoro/shared';
import { apiRequest } from './client';

export const api = {
  setupStatus: () => apiRequest('GET', '/setup/status', setupStatusResponseSchema),
  setup: (body: SetupRequest) => apiRequest('POST', '/setup', recoveryCodeResponseSchema, body),
  login: (body: LoginRequest) => apiRequest('POST', '/auth/login', meResponseSchema, body),
  logout: () => apiRequest('POST', '/auth/logout', null),
  me: () => apiRequest('GET', '/auth/me', meResponseSchema),
  changePin: (body: ChangePinRequest) =>
    apiRequest('PUT', '/auth/me/pin', changePinResponseSchema, body),
  recover: (body: RecoverRequest) =>
    apiRequest('POST', '/auth/recover', recoveryCodeResponseSchema, body),
  listUsers: () => apiRequest('GET', '/users', usersResponseSchema),
  createUser: (body: CreateUserRequest) => apiRequest('POST', '/users', userResponseSchema, body),
  updateUser: (id: string, body: UpdateUserRequest) =>
    apiRequest('PUT', `/users/${encodeURIComponent(id)}`, userResponseSchema, body),

  listCategories: () => apiRequest('GET', '/categories', categoriesResponseSchema),
  createCategory: (body: CreateCategoryRequest) =>
    apiRequest('POST', '/categories', categoryResponseSchema, body),
  updateCategory: (id: string, body: UpdateCategoryRequest) =>
    apiRequest('PUT', `/categories/${encodeURIComponent(id)}`, categoryResponseSchema, body),

  listProducts: (query: ProductsQuery) =>
    apiRequest('GET', `/products?${toSearchParams(query)}`, productsResponseSchema),
  getProduct: (id: string) =>
    apiRequest('GET', `/products/${encodeURIComponent(id)}`, productResponseSchema),
  createProduct: (body: CreateProductRequest) =>
    apiRequest('POST', '/products', productResponseSchema, body),
  updateProduct: (id: string, body: UpdateProductRequest) =>
    apiRequest('PUT', `/products/${encodeURIComponent(id)}`, productResponseSchema, body),
  productByCode: (code: string) =>
    apiRequest('GET', `/products/by-code/${encodeURIComponent(code)}`, productResponseSchema),
  setProductActive: (id: string, active: boolean) =>
    apiRequest('PATCH', `/products/${encodeURIComponent(id)}/active`, productResponseSchema, {
      active,
    }),

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
  saveReceipt: (saleId: string) =>
    apiRequest('POST', `/sales/${encodeURIComponent(saleId)}/receipt`, receiptSavedResponseSchema),
  openReceipt: (saleId: string) =>
    apiRequest('POST', `/sales/${encodeURIComponent(saleId)}/receipt/open`, null),
  openReceiptFolder: () => apiRequest('POST', '/receipts/open-folder', null),
};

/** Browser download URL of a sale's receipt PDF. */
export const receiptDownloadUrl = (saleId: string) =>
  `/api/sales/${encodeURIComponent(saleId)}/receipt.pdf`;

/** Query string from defined, non-empty values. */
function toSearchParams(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}
