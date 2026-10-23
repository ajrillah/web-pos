// Stages the app folder the installer ships: installer/build/app = apps/server/dist (server
// bundle, migrations, web app) plus the external runtime packages (better-sqlite3, pdfkit) and
// their dependencies, copied from the pnpm install so versions match pnpm-lock.yaml.
// better-sqlite3 ships prebuilt binaries for win32-x64, so this also works from Linux.
// Run `pnpm build` first. See docs/design.md section 11.3.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const serverDir = path.join(root, 'apps/server');
const dist = path.join(serverDir, 'dist');
const out = path.join(import.meta.dirname, 'build/app');
/** Kept out of the esbuild bundle (apps/server/scripts/build.mjs). */
const EXTERNAL = ['better-sqlite3', 'pdfkit'];

if (!fs.existsSync(path.join(dist, 'main.js')) || !fs.existsSync(path.join(dist, 'public'))) {
  console.error('apps/server/dist is missing or has no web app. Run `pnpm build` first.');
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(dist, out, { recursive: true });

/** node_modules directory a package's real folder sits in (pnpm keeps dependencies there). */
const nodeModulesOf = (source, name) => source.slice(0, -(name.length + 1));

/** Destination folder -> real source folder, to skip duplicates. */
const copied = new Map();

/**
 * Copies `name` (resolved from `fromNodeModules`) to the top-level node_modules, or nested under
 * `parentDest` when another version already sits at the top. Then its dependencies.
 */
function install(name, fromNodeModules, parentDest) {
  const source = fs.realpathSync(path.join(fromNodeModules, name));
  const top = path.join(out, 'node_modules', name);
  let dest = top;
  if (copied.has(top)) {
    if (copied.get(top) === source) return;
    dest = path.join(parentDest, 'node_modules', name);
    if (copied.get(dest) === source) return;
  }
  copied.set(dest, source);
  fs.cpSync(source, dest, { recursive: true, dereference: true });

  const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  const siblings = nodeModulesOf(source, name);
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
    if (fs.existsSync(path.join(siblings, dep))) install(dep, siblings, dest);
  }
}

for (const name of EXTERNAL) install(name, path.join(serverDir, 'node_modules'), out);

const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
fs.writeFileSync(
  path.join(out, 'package.json'),
  `${JSON.stringify({ name: 'toko-podomoro', version: rootPkg.version, private: true, type: 'module' }, null, 2)}\n`,
);

let files = 0;
let bytes = 0;
for (const entry of fs.readdirSync(out, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  files++;
  bytes += fs.statSync(path.join(entry.parentPath, entry.name)).size;
}
console.log(
  `Staged ${path.relative(root, out)}: ${copied.size} packages, ${files} files, ${(bytes / 1048576).toFixed(1)} MB (version ${rootPkg.version})`,
);
