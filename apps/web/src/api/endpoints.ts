import {
  type ChangePinRequest,
  type CreateUserRequest,
  changePinResponseSchema,
  type LoginRequest,
  meResponseSchema,
  type RecoverRequest,
  recoveryCodeResponseSchema,
  type SetupRequest,
  setupStatusResponseSchema,
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
};
