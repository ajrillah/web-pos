import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { ApiError } from '@toko-podomoro/shared';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import { registerSession } from './auth/session';
import type { AppDatabase } from './db/client';
import { AppError, errorMessages, validationMessage } from './errors';
import { authRoutes } from './routes/auth';
import { backupRoutes } from './routes/backup';
import { categoryRoutes } from './routes/categories';
import { customerRoutes } from './routes/customers';
import { healthRoutes } from './routes/health';
import { productImportRoutes } from './routes/product-import';
import { productRoutes } from './routes/products';
import { reportRoutes } from './routes/reports';
import { saleRoutes } from './routes/sales';
import { settingsRoutes } from './routes/settings';
import { setupRoutes } from './routes/setup';
import { stockRoutes } from './routes/stock';
import { supplierRoutes } from './routes/suppliers';
import { userRoutes } from './routes/users';
import { ApprovalStore } from './security/approvals';
import type { SystemContext } from './services/backup-service';
import type { ServiceContext } from './services/context';
import { openWithSystem } from './system/open-path';

export interface AppOptions {
  db: AppDatabase;
  /** Built web app directory; served with SPA fallback when it contains index.html. */
  webDir?: string | undefined;
  logger?: FastifyServerOptions['logger'];
  /** Clock for session expiry; tests inject a controllable one. */
  now?: () => Date;
  /** Opens receipts and the receipt folder; tests inject a fake. */
  openPath?: (target: string) => void;
  /** Data directory, raw SQLite handle, and restart hook for backup / restore. */
  system?: SystemContext;
}

// Blocks DNS-rebinding: browsers send the attacker's hostname, not one of these.
const allowedHostnames = new Set(['127.0.0.1', 'localhost']);

export function errorBody(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export async function buildApp({
  db,
  webDir,
  logger = false,
  now = () => new Date(),
  openPath = openWithSystem,
  system,
}: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger });
  const ctx: ServiceContext = { db, now, openPath, approvals: new ApprovalStore(now) };

  app.addHook('onRequest', async (request, reply) => {
    if (!allowedHostnames.has(request.hostname)) {
      return reply.status(403).send(errorBody('FORBIDDEN_HOST', errorMessages.forbiddenHost));
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(errorBody(error.code, error.message));
    }
    if (error instanceof ZodError) {
      const field = error.issues[0]?.path.join('.') || undefined;
      return reply.status(400).send(errorBody('VALIDATION_ERROR', validationMessage(field)));
    }
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (statusCode === 413) {
      return reply.status(413).send(errorBody('PAYLOAD_TOO_LARGE', errorMessages.payloadTooLarge));
    }
    if (statusCode === 415) {
      return reply
        .status(415)
        .send(errorBody('UNSUPPORTED_MEDIA_TYPE', errorMessages.unsupportedMediaType));
    }
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      return reply.status(400).send(errorBody('BAD_REQUEST', errorMessages.badRequest));
    }
    request.log.error(error);
    return reply.status(500).send(errorBody('INTERNAL_ERROR', errorMessages.internal));
  });

  await registerSession(app, ctx);
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(setupRoutes, { prefix: '/api', ctx });
  await app.register(authRoutes, { prefix: '/api', ctx });
  await app.register(userRoutes, { prefix: '/api', ctx });
  await app.register(categoryRoutes, { prefix: '/api', ctx });
  await app.register(productImportRoutes, { prefix: '/api', ctx });
  await app.register(productRoutes, { prefix: '/api', ctx });
  await app.register(saleRoutes, { prefix: '/api', ctx });
  await app.register(customerRoutes, { prefix: '/api', ctx });
  await app.register(supplierRoutes, { prefix: '/api', ctx });
  await app.register(stockRoutes, { prefix: '/api', ctx });
  await app.register(reportRoutes, { prefix: '/api', ctx });
  await app.register(settingsRoutes, { prefix: '/api', ctx });
  if (system) {
    await app.register(backupRoutes, { prefix: '/api', ctx, system });
  }

  const hasWeb = webDir !== undefined && fs.existsSync(path.join(webDir, 'index.html'));
  if (hasWeb) {
    await app.register(fastifyStatic, { root: webDir, wildcard: false });
  }

  app.setNotFoundHandler((request, reply) => {
    const isApi = request.url === '/api' || request.url.startsWith('/api/');
    if (hasWeb && !isApi && (request.method === 'GET' || request.method === 'HEAD')) {
      return reply.sendFile('index.html');
    }
    return reply.status(404).send(errorBody('NOT_FOUND', errorMessages.notFound));
  });

  return app;
}
