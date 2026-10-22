import {
  type CategoriesResponse,
  type CategoryResponse,
  createCategoryRequestSchema,
  updateCategoryRequestSchema,
} from '@toko-podomoro/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { currentActor, requireApproval, requireUser } from '../auth/session';
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
    { preHandler: requireApproval(ctx.approvals, 'category.manage') },
    async (request, reply): Promise<CategoryResponse> => {
      const input = createCategoryRequestSchema.parse(request.body);
      const category = createCategory(ctx, currentActor(request), input);
      reply.status(201);
      return { category };
    },
  );

  app.put(
    '/categories/:id',
    {
      preHandler: requireApproval(
        ctx.approvals,
        'category.manage',
        (request) => idParamsSchema.parse(request.params).id,
      ),
    },
    async (request): Promise<CategoryResponse> => {
      const { id } = idParamsSchema.parse(request.params);
      const input = updateCategoryRequestSchema.parse(request.body);
      return { category: updateCategoryById(ctx, currentActor(request), id, input) };
    },
  );
};
