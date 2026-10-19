import type { HealthResponse } from '@toko-podomoro/shared';
import type { FastifyPluginAsync } from 'fastify';
import { appVersion } from '../version';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (): Promise<HealthResponse> => ({ status: 'ok', version: appVersion }));
};
