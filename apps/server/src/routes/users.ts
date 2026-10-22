import {
  createUserRequestSchema,
  type UserResponse,
  type UsersResponse,
  updateUserRequestSchema,
} from '@toko-podomoro/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { currentUser, requireOwner } from '../auth/session';
import type { ServiceContext } from '../services/context';
import { createUser, listAllUsers, updateUserById } from '../services/user-service';

const idParamsSchema = z.object({ id: z.string().min(1) });

export const userRoutes: FastifyPluginAsync<{ ctx: ServiceContext }> = async (app, { ctx }) => {
  app.addHook('preHandler', requireOwner);

  app.get('/users', async (): Promise<UsersResponse> => ({ users: listAllUsers(ctx) }));

  app.post('/users', async (request, reply): Promise<UserResponse> => {
    const input = createUserRequestSchema.parse(request.body);
    const user = await createUser(ctx, currentUser(request), input);
    reply.status(201);
    return { user };
  });

  app.put('/users/:id', async (request): Promise<UserResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    const input = updateUserRequestSchema.parse(request.body);
    return { user: await updateUserById(ctx, currentUser(request), id, input) };
  });
};
