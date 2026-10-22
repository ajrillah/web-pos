import type { SettingsResponse } from '@toko-podomoro/shared';
import type { FastifyPluginAsync } from 'fastify';
import { requireUser } from '../auth/session';
import type { ServiceContext } from '../services/context';
import { getSettings } from '../services/settings-service';

/** Read-only for now; `PUT settings` (PIN) arrives with the settings page in Stage 5. */
export const settingsRoutes: FastifyPluginAsync<{ ctx: ServiceContext }> = async (app, { ctx }) => {
  app.get(
    '/settings',
    { preHandler: requireUser },
    async (): Promise<SettingsResponse> => ({ settings: getSettings(ctx.db) }),
  );
};
