import { type SettingsResponse, updateSettingsRequestSchema } from '@toko-podomoro/shared';
import type { FastifyPluginAsync } from 'fastify';
import { currentActor, requireApproval, requireUser } from '../auth/session';
import type { ServiceContext } from '../services/context';
import { getSettings, updateSettings } from '../services/settings-service';

/** Everyone reads settings; changing them is the Profil Toko PIN menu. */
export const settingsRoutes: FastifyPluginAsync<{ ctx: ServiceContext }> = async (app, { ctx }) => {
  app.get(
    '/settings',
    { preHandler: requireUser },
    async (): Promise<SettingsResponse> => ({ settings: getSettings(ctx.db) }),
  );

  app.put(
    '/settings',
    { preHandler: requireApproval(ctx.approvals, 'profil-toko') },
    async (request): Promise<SettingsResponse> => {
      const input = updateSettingsRequestSchema.parse(request.body);
      return { settings: updateSettings(ctx, currentActor(request), input) };
    },
  );
};
