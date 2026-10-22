import {
  createProductRequestSchema,
  type ProductResponse,
  type ProductsResponse,
  productsQuerySchema,
  setProductActiveRequestSchema,
  updateProductRequestSchema,
} from '@toko-podomoro/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { approvalFor, currentActor, currentUser, requireUser } from '../auth/session';
import type { ServiceContext } from '../services/context';
import {
  createProduct,
  getProduct,
  getProductByCode,
  searchProducts,
  setProductActive,
  updateProductById,
} from '../services/product-service';

const idParamsSchema = z.object({ id: z.string().min(1) });
const codeParamsSchema = z.object({ code: z.string().trim().min(1).max(64) });

/** Open to all users; the service enforces owner approval for price changes and deactivation. */
export const productRoutes: FastifyPluginAsync<{ ctx: ServiceContext }> = async (app, { ctx }) => {
  app.addHook('preHandler', requireUser);

  app.get(
    '/products',
    async (request): Promise<ProductsResponse> =>
      searchProducts(ctx, productsQuerySchema.parse(request.query)),
  );

  app.get('/products/by-code/:code', async (request): Promise<ProductResponse> => {
    const { code } = codeParamsSchema.parse(request.params);
    return { product: getProductByCode(ctx, code) };
  });

  app.get('/products/:id', async (request): Promise<ProductResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    return { product: getProduct(ctx, id) };
  });

  app.post('/products', async (request, reply): Promise<ProductResponse> => {
    const input = createProductRequestSchema.parse(request.body);
    const product = createProduct(ctx, currentUser(request), input);
    reply.status(201);
    return { product };
  });

  app.put('/products/:id', async (request): Promise<ProductResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    const input = updateProductRequestSchema.parse(request.body);
    // Price changes need approval for cashiers; the service decides whether this edit has any.
    approvalFor(request, ctx.approvals, 'product.price', id);
    return { product: updateProductById(ctx, currentActor(request), id, input) };
  });

  app.patch('/products/:id/active', async (request): Promise<ProductResponse> => {
    const { id } = idParamsSchema.parse(request.params);
    const { active } = setProductActiveRequestSchema.parse(request.body);
    if (!active) approvalFor(request, ctx.approvals, 'product.deactivate', id);
    return { product: setProductActive(ctx, currentActor(request), id, active) };
  });
};
