// Bundles the server into dist/main.js and copies migrations and the built web app next to it.
// Native modules and pdfkit (it loads its standard fonts through package `#imports` at runtime)
// stay external; everything else (including @toko-podomoro/shared) is bundled.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const webDist = path.resolve(root, '../web/dist');

fs.rmSync(dist, { recursive: true, force: true });

await build({
  entryPoints: [path.join(root, 'src/main.ts')],
  outfile: path.join(dist, 'main.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node26',
  external: ['better-sqlite3', 'pdfkit'],
  define: { __BUNDLED__: 'true' },
  // CommonJS dependencies inside an ESM bundle need require/__dirname.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { dirname as __pathDirname } from 'node:path';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      'const require = __createRequire(import.meta.url);',
      'const __filename = __fileURLToPath(import.meta.url);',
      'const __dirname = __pathDirname(__filename);',
    ].join('\n'),
  },
  logLevel: 'warning',
});

fs.cpSync(path.join(root, 'drizzle'), path.join(dist, 'drizzle'), { recursive: true });

if (fs.existsSync(path.join(webDist, 'index.html'))) {
  fs.cpSync(webDist, path.join(dist, 'public'), { recursive: true });
} else {
  console.warn('apps/web/dist not found; building server without web assets.');
}

console.log(`Server built: ${path.relative(process.cwd(), dist)}`);
