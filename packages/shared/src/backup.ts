import { z } from 'zod';

// Manual backup and restore (docs/design.md 11.4). The backup itself is a .zip download.

/** `POST restore`: the data is replaced and the server restarts after this response. */
export const restoreResponseSchema = z.object({ restarting: z.literal(true) });
export type RestoreResponse = z.infer<typeof restoreResponseSchema>;
