# TOKO PODOMORO

Offline point-of-sale app for Indonesian grocery stores (toko kelontong). One Windows PC, no
internet needed: a local server on `127.0.0.1` and the app window in Microsoft Edge.

Full specification: [`docs/design.md`](docs/design.md). UI design: [`docs/ui-style.md`](docs/ui-style.md).

## Development

Requires Node 26 (`.nvmrc`) and pnpm 12.

```bash
nvm use
pnpm install
pnpm dev        # web on http://127.0.0.1:5173 (proxies /api), server on 127.0.0.1:4747
```

Development data lives in `./data/` (git-ignored). Use `TOKO_PODOMORO_DATA_DIR=<dir>` for a
separate database. Use `127.0.0.1` or `localhost` in the address bar; other host names are refused.

| Command | Does |
|---|---|
| `pnpm build` | Builds the web app and bundles the server into `apps/server/dist` |
| `pnpm start` | Runs the built app on `http://127.0.0.1:4747` |
| `pnpm test` | Vitest in every package |
| `pnpm typecheck` | TypeScript in every package |
| `pnpm check` | Biome lint and format check |
| `pnpm db:generate` / `pnpm db:migrate` | Create / apply database migrations |

## Building the Windows installer

Details: `docs/design.md` section 11.3.

1. `pnpm installer:prepare` builds everything and stages `installer/build/app` (server bundle, web
   app, migrations, and the `better-sqlite3` and `pdfkit` packages).
2. Download the Node 26 **Windows x64** zip from nodejs.org and copy its `node.exe` to
   `installer/node/node.exe`.
3. Compile with NSIS 3 (`makensis`, on Windows or Linux):

   ```bash
   makensis /DVERSION=0.2.0 installer/toko-podomoro.nsi
   ```

   The result is `installer/output/TokoPodomoro-Setup-0.2.0.exe`.

## Installing on a store PC

1. Run `TokoPodomoro-Setup-<version>.exe` (needs an administrator account).
2. The installer puts the program in `C:\Program Files\TokoPodomoro\` and creates shortcuts on the
   desktop, in the Start Menu, and in Startup (the app opens when Windows starts).
3. Open **TOKO PODOMORO**. On the first start, create the owner account and write down the
   recovery code.

### Windows SmartScreen warning

The installer is not code-signed yet, so Windows SmartScreen may show "Windows protected your PC"
the first time it runs. This is normal for unsigned apps:

1. Click **More info** (Indonesian Windows: **Info selengkapnya**).
2. Click **Run anyway** (**Tetap jalankan**).

Only do this for an installer you got directly from the developer.

### Where things are

| What | Where |
|---|---|
| Program | `C:\Program Files\TokoPodomoro\` |
| Data (database, `config.json`, `server.log`) | `C:\ProgramData\TokoPodomoro\` |
| Receipt PDFs | `Documents\TokoPodomoro\Nota\` of the Windows user (setting "folder nota") |

The port is `4747` by default. To change it, edit `"port"` in
`C:\ProgramData\TokoPodomoro\config.json` and reopen the app. If the port is already used by
another program, the app shows a message saying so.

Uninstalling (Settings > Apps, or Start Menu > Hapus TOKO PODOMORO) removes the program but
keeps `C:\ProgramData\TokoPodomoro\`, so the store's data is not lost.

## Backup and restore

Owner account only, in **Pengaturan > Cadangan Data**.

### Make a backup

1. Click **Cadangkan Data**. Edge saves `TokoPodomoro_YYYY-MM-DD_HHmmss.zip` to the Downloads
   folder. It contains the database, `config.json`, and all receipt PDFs.
2. Copy the file off the PC (flashdisk, another computer). A backup that stays on the same PC is
   lost together with the PC.

Make a backup at least once a week, and before moving the app to a new PC.

### Restore a backup

Restoring **replaces all current data** (products, sales, kasbon, users, settings) with the
contents of the backup.

1. Log in as an owner and open **Pengaturan > Cadangan Data**.
2. Click **Pulihkan Data** and choose the backup `.zip`.
3. Read the warning and click **Pulihkan**.
4. The app checks the file, restarts by itself, and returns to the login screen. Log in with the
   accounts and PINs that existed when the backup was made.

Before replacing anything, the app copies the current database to
`C:\ProgramData\TokoPodomoro\cadangan-sebelum-pulihkan\`. If the wrong backup was restored, a
technician can put that copy back.

The app refuses a file that is not a TOKO PODOMORO backup, is damaged, or was made by a newer
version of the app; in that case nothing is changed.

### Move to a new PC

1. On the old PC: make a backup.
2. On the new PC: install TOKO PODOMORO, open it, and create a temporary owner account.
3. Restore the backup as above. The temporary account is replaced by the accounts from the backup.
