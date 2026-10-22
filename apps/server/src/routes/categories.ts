import {
  type CategoriesResponse,
  type CategoryResponse,
  createCategoryRequestSchema,
  updateCategoryRequestSchema,
} from '@toko-podomoro/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { currentUser, requireOwner, requireUser } from '../auth/session';
import {
  createCategory,
  listAllCategories,
  updateCategoryById,
} from '../services/category-service';
import type { ServiceContext } from '../services/context';

const idParamsSchema = z.object({ id: z.string().min(1) });

/** Everyone reads categories; adding and changing them is owner-only (PIN for cashiers). */
export const categoryRoutes: FastifyPluginAsync<{ ctx: ServiceContext }> = async (app, { ctx }) => {
  app.get(
    '/categories',
    { preHandler: requireUser },
    async (): Promise<CategoriesResponse> => ({ categories: listAllCategories(ctx) }),
  );

  app.post(
    '/categories',
    { preHandler: requireOwner },
    async (request, reply): Promise<CategoryResponse> => {
      const input = createCategoryRequestSchema.parse(request.body);
      const category = createCategory(ctx, currentUser(request), input);
      reply.status(201);
      return { category };
    },
  );

  app.put(
    '/categories/:id',
    { preHandler: requireOwner },
    async (request): Promise<CategoryResponse> => {
      const { id } = idParamsSchema.parse(request.params);
      const input = updateCategoryRequestSchema.parse(request.body);
      return { category: updateCategoryById(ctx, currentUser(request), id, input) };
    },
  );
};
