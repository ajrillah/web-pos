import { spawn } from 'node:child_process';

/**
 * Opens a file or folder with the OS default app, detached from the server.
 * Windows: Explorer opens PDFs in the default viewer and folders in a window.
 */
export function openWithSystem(target: string): void {
  const [command, args] =
    process.platform === 'win32'
      ? ['explorer.exe', [target]]
      : process.platform === 'darwin'
        ? ['open', [target]]
        : ['xdg-open', [target]];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  // A missing opener (e.g. a headless dev box) must not crash the server.
  child.on('error', () => {});
  child.unref();
}
