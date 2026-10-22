import type { Role } from '@toko-podomoro/shared';
import type { AppDatabase } from '../db/client';

/** Dependencies shared by all services. `now` is injectable so tests can move time. */
export interface ServiceContext {
  db: AppDatabase;
  now: () => Date;
  /** Opens a file or folder with the OS default app (receipts); tests inject a fake. */
  openPath: (target: string) => void;
}

/** The logged-in user performing an action. */
export interface Actor {
  id: string;
  role: Role;
}
