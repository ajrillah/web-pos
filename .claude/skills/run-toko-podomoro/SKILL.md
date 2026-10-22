---
name: run-toko-podomoro
description: Build, start, run, and drive the TOKO PODOMORO POS app (Fastify server + React web UI). Use when asked to run or start the app, launch the dev server, smoke-test the API with curl, take a screenshot of a page, click through the UI, test keyboard shortcuts, or confirm a change works in the real running app.
---

# Run TOKO PODOMORO

One Node process serves the web UI and `/api` on `127.0.0.1:4747`. Agents drive the UI with the zero-dependency headless-Chromium driver `.claude/skills/run-toko-podomoro/driver.mjs` (stdin script -> CDP), and the API with `curl`. All paths are relative to the repo root.

## Prerequisites

Node 26 and pnpm 12 (the workspace refuses other Node majors). A Chromium headless shell for the driver; this container already had its system libraries, no `apt-get` was needed.

```bash
source ~/.nvm/nvm.sh && nvm install 26 && nvm use    # .nvmrc says 26
npm i -g pnpm@12.14.0                                 # Node 26 has no corepack
npx -y playwright install chromium-headless-shell     # -> ~/.cache/ms-playwright, found automatically
```

## Setup and build

```bash
pnpm install
pnpm build          # web -> apps/web/dist, server bundle -> apps/server/dist (incl. drizzle/, public/)
```

## Run (agent path)

Start the built app on an isolated data dir, wait for health, drive, stop by port. A fresh data dir redirects every page to `/setup`; this script creates the owner (`pemilik` / PIN `111111`) and lands on the owner home:

```bash
export TOKO_PODOMORO_DATA_DIR=/tmp/toko-data && rm -rf /tmp/toko-data
node apps/server/dist/main.js > /tmp/toko-server.log 2>&1 &
timeout 30 bash -c 'until curl -sf http://127.0.0.1:4747/api/health >/dev/null; do sleep 0.2; done'

node .claude/skills/run-toko-podomoro/driver.mjs <<'EOF'
nav /
wait-for text=Pengaturan awal
fill #name Bu Sari
fill #username pemilik
fill #pin 111111
fill #confirm 111111
click button[type=submit]
wait-for [data-testid=recovery-code]
click input[type=checkbox]
click button:not([disabled])
wait-for text=Selamat datang, Bu Sari
text nav
screenshot owner-home
console
EOF

lsof -ti:4747 -sTCP:LISTEN | xargs -r kill
```

Driver prints `READY`, then `ok <cmd>[: output]` or `error <cmd>: ...` per line; exit code 1 if any command failed. Screenshots -> `/tmp/toko-shots/<name>.png` (`SHOTS_DIR` overrides). Look at them with the Read tool.

| command | does |
|---|---|
| `nav <path or url>` | navigate (paths prefixed with `BASE_URL`, default `http://127.0.0.1:4747`), waits for load |
| `wait-for text=<t>` / `wait-for <css>` | poll up to 15 s |
| `click <css>` | real mouse click at element center |
| `fill <css> <text>` | click, select all, insert text (works with React controlled inputs) |
| `type <text>` | insert text into the focused element |
| `press <key>` | `Enter`, `Escape`, `Tab`, arrows, `F1`-`F12`, letters/digits, with `Control+`/`Alt+`/`Shift+`/`Meta+` (e.g. `Control+l`, `Alt+1`) |
| `text [css]` / `url` / `eval <js>` | read innerText / location / evaluate JS (JSON result) |
| `screenshot [name]` | full viewport PNG, 1280x800 |
| `console` | console errors, uncaught exceptions, failed requests since start (the anonymous `auth/me` check logs an expected 401) |
| `sh <command>` | run a bash command between steps, e.g. restart the server; the browser keeps its cookies |

Later runs on the same data dir: log in instead (`nav /login`, `fill #username pemilik`, `fill #pin 111111`, `press Enter`, `wait-for text=Selamat datang`). Users created in Pengaturan > Pengguna have a temporary PIN and land on `/ubah-pin` (`#currentPin`, `#newPin`, `#confirm`) at first login.

API smoke (server running):

```bash
curl -s 127.0.0.1:4747/api/health                                  # {"status":"ok","version":"0.0.0"}
curl -s -c /tmp/toko-cookies -H 'content-type: application/json' -d '{"username":"pemilik","pin":"111111"}' 127.0.0.1:4747/api/auth/login
curl -s -b /tmp/toko-cookies 127.0.0.1:4747/api/users              # {"users":[...]} with the owner session
curl -s -w ' [%{http_code}]\n' 127.0.0.1:4747/api/nope             # NOT_FOUND [404]
curl -s -w ' [%{http_code}]\n' -H 'Host: evil.test' 127.0.0.1:4747/api/health   # FORBIDDEN_HOST [403]
```

Dev mode (Vite UI on 5173, proxying `/api` to 4747; hot reload), same driver with `BASE_URL`:

```bash
pnpm dev > /tmp/toko-dev.log 2>&1 &
timeout 60 bash -c 'until curl -sf http://127.0.0.1:5173/api/health >/dev/null; do sleep 0.3; done'
BASE_URL=http://127.0.0.1:5173 node .claude/skills/run-toko-podomoro/driver.mjs <<'EOF'
nav /
wait-for text=TOKO PODOMORO
url
screenshot dev-home
EOF
lsof -ti:5173,4747 -sTCP:LISTEN | xargs -r kill
```

## Run (human path)

`pnpm build && pnpm start`, open `http://127.0.0.1:4747`, Ctrl-C to stop. Data goes to `./data/` unless `TOKO_PODOMORO_DATA_DIR` is set.

## Test

```bash
pnpm check && pnpm typecheck && pnpm test     # shared 35, web 9, server 64 tests
```

## Direct invocation (no running server)

Most server/shared changes only need this. Shared math:

```bash
apps/server/node_modules/.bin/tsx -e "import { lineSubtotal, roundSaleTotal, formatRupiah } from '@toko-podomoro/shared'; const s = lineSubtotal({ qtyBase: 250, unitPrice: 14_000, unitFactor: 1000 }); console.log(s, roundSaleTotal(12_350, '100'), formatRupiah(s));"
# 3500 { total: 12400, roundingAmount: 50 } Rp 3.500
```

An API route against an in-memory, migrated DB (no port, no data dir):

```bash
apps/server/node_modules/.bin/tsx --input-type=module -e "
import { buildApp } from './apps/server/src/app.ts';
import { openDatabase } from './apps/server/src/db/client.ts';
import { runMigrations } from './apps/server/src/db/migrate.ts';
import { migrationsDir } from './apps/server/src/paths.ts';
const { db } = openDatabase(':memory:');
runMigrations(db, migrationsDir);
const app = await buildApp({ db });
const res = await app.inject({ method: 'GET', url: '/api/health' });
console.log(res.statusCode, res.body);
await app.close();
"
# 200 {"status":"ok","version":"0.0.0"}
```

## Gotchas

- **Stop servers by port, never `pkill -f`** - the pattern matches the agent's own shell command line and kills it (exit 144). `$!` after `pnpm dev &` is only the pnpm wrapper; killing it leaves Vite and tsx running. Use `lsof -ti:<port> -sTCP:LISTEN | xargs -r kill`.
- **Use `127.0.0.1` or `localhost` in URLs** - any other Host header (container hostname, LAN IP) gets 403 `FORBIDDEN_HOST` by design.
- **Key presses skip browser shortcuts** - an unhandled `press F5` or `Control+r` does not reload in the headless shell. The driver proves the app's keydown handlers fire and call `preventDefault`; it cannot prove Edge's own F-key defaults are suppressed. That still needs Edge on Windows (Stage 3 checklist).
- **Always set `TOKO_PODOMORO_DATA_DIR` for agent runs** - otherwise the server writes `./data/toko-podomoro.db` and `config.json` in the repo (git-ignored, but shared with the human's dev data).
- **Port in dev is fixed** - `apps/web/vite.config.ts` proxies to 4747; changing `port` in `config.json` breaks the dev proxy.
- **`driver.mjs` is inside Biome's scope** - after editing it run `./node_modules/.bin/biome check --write .claude/skills/run-toko-podomoro/driver.mjs`, or `pnpm check` fails.
- **First `pnpm test` after install can be slow** - one cold run took 29 s and timed out the listen test at 5 s; reruns take <1 s.

## Troubleshooting

- **`Cannot find module '~/.cache/node/corepack/v1/pnpm/12.14.0/bin/pnpm.cjs'`**: you are on Node 22, whose `pnpm` is a corepack shim. `source ~/.nvm/nvm.sh && nvm use`, then `npm i -g pnpm@12.14.0` if `pnpm` is missing.
- **`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION ... published ... within the minimumReleaseAge cutoff`**: a dependency version is under 1 day old. Pin an older release in `package.json`, then `pnpm clean --lockfile && pnpm install`. Never add `minimumReleaseAgeExclude` (CLAUDE.md).
- **`Ignored build scripts: esbuild@...`**: `pnpm approve-builds esbuild -y` (already recorded as `allowBuilds` in `pnpm-workspace.yaml`).
- **`TypeError: Cannot open database because the directory does not exist`**: the data dir is missing; `main.ts` and `db:migrate` create it - if you open a DB from new code, `fs.mkdirSync(dir, { recursive: true })` first.
- **`Port 4747 sudah dipakai aplikasi lain...`, exit 1**: a previous server is still listening; `lsof -ti:4747 -sTCP:LISTEN | xargs -r kill`.
- **`Top-level await is currently not supported with the "cjs" output format`** from `tsx -e`: add `--input-type=module`.
