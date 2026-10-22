import type { Executor } from '../db/client';
import { settings } from '../db/schema';

/** All stored settings as key -> raw text value. Missing keys use defaults in the service. */
export function readSettings(db: Executor): Map<string, string> {
  return new Map(
    db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .all()
      .map((r) => [r.key, r.value]),
  );
}

export function writeSetting(db: Executor, key: string, value: string): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}
