import path from 'node:path';

// Replaced with `true` by scripts/build.mjs when bundling.
declare const __BUNDLED__: boolean | undefined;

const isBundled = typeof __BUNDLED__ !== 'undefined' && __BUNDLED__;
const here = import.meta.dirname;

/** Bundled: dist/ holds main.js, drizzle/ and public/. From source: apps/server/. */
export const appRoot = isBundled ? here : path.resolve(here, '..');

export const migrationsDir = path.join(appRoot, 'drizzle');

export const webDir = isBundled
  ? path.join(appRoot, 'public')
  : path.resolve(appRoot, '../web/dist');
