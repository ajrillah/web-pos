import {
  type ChangePinRequest,
  type CreateCategoryRequest,
  type CreateProductRequest,
  type CreateUserRequest,
  categoriesResponseSchema,
  categoryResponseSchema,
  changePinResponseSchema,
  type LoginRequest,
  meResponseSchema,
  type ProductsQuery,
  productResponseSchema,
  productsResponseSchema,
  type RecoverRequest,
  recoveryCodeResponseSchema,
  type SetupRequest,
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
  setProductActive: (id: string, active: boolean) =>
    apiRequest('PATCH', `/products/${encodeURIComponent(id)}/active`, productResponseSchema, {
      active,
    }),
};

/** Query string from defined, non-empty values. */
function toSearchParams(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}
