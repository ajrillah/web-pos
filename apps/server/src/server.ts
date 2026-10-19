import type { FastifyInstance } from 'fastify';
import { portInUseMessage, StartupError } from './errors';

export const HOST = '127.0.0.1';

/** Listens on 127.0.0.1 only. A busy port becomes a StartupError with an Indonesian message. */
export async function listenLocal(app: FastifyInstance, port: number): Promise<void> {
  try {
    await app.listen({ host: HOST, port });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      throw new StartupError(portInUseMessage(port));
    }
    throw error;
  }
}
