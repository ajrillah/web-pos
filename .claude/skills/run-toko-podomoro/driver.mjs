#!/usr/bin/env node
// Headless Chromium driver for TOKO PODOMORO. Zero dependencies: speaks the Chrome DevTools
// Protocol over Node's built-in WebSocket (Node >= 22).
//
// Usage: node .claude/skills/run-toko-podomoro/driver.mjs < script.txt
//        (or a heredoc). One command per line; blank lines and lines starting with # are skipped.
// Exit code is 1 if any command failed.
//
// Env: CHROME_BIN    browser binary (default: newest chrome-headless-shell in ~/.cache/ms-playwright)
//      SHOTS_DIR     screenshot directory (default: /tmp/toko-shots)
//      BASE_URL      prefix for relative nav paths (default: http://127.0.0.1:4747)

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const SHOTS_DIR = process.env.SHOTS_DIR ?? '/tmp/toko-shots';
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4747';
const TIMEOUT_MS = 15_000;

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const cache = path.join(os.homedir(), '.cache/ms-playwright');
  const dirs = fs.existsSync(cache)
    ? fs
        .readdirSync(cache)
        .filter((d) => d.startsWith('chromium_headless_shell-'))
        .sort()
    : [];
  for (const dir of dirs.reverse()) {
    const bin = path.join(cache, dir, 'chrome-headless-shell-linux64/chrome-headless-shell');
    if (fs.existsSync(bin)) return bin;
  }
  throw new Error(
    'No browser found. Set CHROME_BIN or run: npx -y playwright install chromium-headless-shell',
  );
}

async function launch() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toko-driver-'));
  const proc = spawn(
    findChrome(),
    [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--window-size=1280,800',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const port = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`browser did not start:\n${buf}`)), TIMEOUT_MS);
    proc.stderr.on('data', (chunk) => {
      buf += chunk;
      const m = buf.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
    proc.on('exit', (code) => reject(new Error(`browser exited (${code}):\n${buf}`)));
  });
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  return { proc, ws, userDataDir };
}

function createClient(ws) {
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
    }
  };
  return {
    send(method, params = {}) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    on(method, fn) {
      listeners.set(method, [...(listeners.get(method) ?? []), fn]);
    },
    once(method, timeoutMs = TIMEOUT_MS) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`timeout waiting for ${method}`)),
          timeoutMs,
        );
        const fn = (params) => {
          clearTimeout(timer);
          listeners.set(
            method,
            (listeners.get(method) ?? []).filter((f) => f !== fn),
          );
          resolve(params);
        };
        this.on(method, fn);
      });
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
  }
  return res.result.value;
}

async function waitUntil(cdp, expression, label) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression).catch(() => false)) return;
    await sleep(100);
  }
  throw new Error(`timeout waiting for ${label}`);
}

// Key name -> CDP key event fields. Supports Enter, Escape, Tab, Backspace, Delete, arrows,
// F1-F12, single letters/digits, combined with Control+/Alt+/Shift+/Meta+ (e.g. Control+l, Alt+1).
function keyFields(name) {
  const special = {
    Enter: [13, 'Enter', '\r'],
    Escape: [27, 'Escape'],
    Tab: [9, 'Tab'],
    Backspace: [8, 'Backspace'],
    Delete: [46, 'Delete'],
    ArrowUp: [38, 'ArrowUp'],
    ArrowDown: [40, 'ArrowDown'],
    ArrowLeft: [37, 'ArrowLeft'],
    ArrowRight: [39, 'ArrowRight'],
  };
  if (special[name]) {
    const [code, key, text] = special[name];
    return { key, code: key, windowsVirtualKeyCode: code, text };
  }
  const f = name.match(/^F(\d{1,2})$/);
  if (f) return { key: name, code: name, windowsVirtualKeyCode: 111 + Number(f[1]) };
  if (/^[a-z]$/i.test(name)) {
    return {
      key: name,
      code: `Key${name.toUpperCase()}`,
      windowsVirtualKeyCode: name.toUpperCase().charCodeAt(0),
      text: name,
    };
  }
  if (/^\d$/.test(name)) {
    return {
      key: name,
      code: `Digit${name}`,
      windowsVirtualKeyCode: name.charCodeAt(0),
      text: name,
    };
  }
  throw new Error(`unknown key: ${name}`);
}

async function press(cdp, combo) {
  const parts = combo.split('+');
  const keyName = parts.pop();
  const bits = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };
  let modifiers = 0;
  for (const p of parts) {
    if (!(p in bits)) throw new Error(`unknown modifier: ${p}`);
    modifiers |= bits[p];
  }
  const fields = keyFields(keyName);
  // Modifier combos must not insert text (Control+l would type "l" otherwise).
  const text = modifiers & ~bits.Shift ? undefined : fields.text;
  await cdp.send('Input.dispatchKeyEvent', {
    type: text ? 'keyDown' : 'rawKeyDown',
    modifiers,
    ...fields,
    text,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    modifiers,
    ...fields,
    text: undefined,
  });
}

async function center(cdp, selector) {
  await waitUntil(cdp, `!!document.querySelector(${JSON.stringify(selector)})`, selector);
  return evaluate(
    cdp,
    `(() => { const el = document.querySelector(${JSON.stringify(selector)});
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
  );
}

async function click(cdp, selector) {
  const { x, y } = await center(cdp, selector);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
}

async function main() {
  const { proc, ws, userDataDir } = await launch();
  const cdp = createClient(ws);
  const errors = [];
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error')
      errors.push(`console.error: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
  });
  cdp.on('Runtime.exceptionThrown', (p) =>
    errors.push(
      `exception: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`,
    ),
  );
  cdp.on('Log.entryAdded', (p) => {
    if (p.entry.level === 'error') errors.push(`log: ${p.entry.text} ${p.entry.url ?? ''}`.trim());
  });
  await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable'].map((m) => cdp.send(m)));
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  console.log('READY');

  const commands = {
    async nav(arg) {
      const url = /^https?:/.test(arg) ? arg : `${BASE_URL}${arg.startsWith('/') ? '' : '/'}${arg}`;
      const loaded = cdp.once('Page.loadEventFired');
      const res = await cdp.send('Page.navigate', { url });
      if (res.errorText) throw new Error(`${res.errorText} (${url})`);
      await loaded;
      return url;
    },
    async 'wait-for'(arg) {
      if (arg.startsWith('text=')) {
        const text = arg.slice(5);
        await waitUntil(cdp, `document.body?.innerText.includes(${JSON.stringify(text)})`, arg);
      } else {
        await waitUntil(cdp, `!!document.querySelector(${JSON.stringify(arg)})`, arg);
      }
    },
    async click(arg) {
      await click(cdp, arg);
    },
    async fill(arg) {
      const [selector, ...rest] = arg.split(' ');
      await click(cdp, selector);
      await evaluate(cdp, `document.activeElement.select?.()`);
      await cdp.send('Input.insertText', { text: rest.join(' ') });
    },
    async type(arg) {
      await cdp.send('Input.insertText', { text: arg });
    },
    async press(arg) {
      await press(cdp, arg);
    },
    async text(arg) {
      const sel = JSON.stringify(arg || 'body');
      return evaluate(cdp, `document.querySelector(${sel})?.innerText ?? '(not found)'`);
    },
    async url() {
      return evaluate(cdp, 'location.href');
    },
    async eval(arg) {
      return JSON.stringify(await evaluate(cdp, arg));
    },
    async screenshot(arg) {
      const name = (arg || `shot-${Date.now()}`).replace(/\.png$/, '');
      const file = path.join(SHOTS_DIR, `${name}.png`);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
    async sh(arg) {
      // Runs a shell command between steps (e.g. restart the server); browser state is kept.
      return execSync(arg, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: '/bin/bash',
      }).trim();
    },
    async console() {
      return errors.length ? errors.join('\n') : '(no errors)';
    },
  };

  let failed = false;
  const rl = readline.createInterface({ input: process.stdin });
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [cmd, ...rest] = line.split(' ');
    const arg = rest.join(' ');
    if (cmd === 'quit') break;
    const fn = commands[cmd];
    try {
      if (!fn) throw new Error(`unknown command (${Object.keys(commands).join(', ')}, quit)`);
      const out = await fn(arg);
      console.log(`ok ${cmd}${out !== undefined ? `: ${out}` : ''}`);
    } catch (error) {
      failed = true;
      console.log(`error ${cmd}: ${error.message}`);
    }
  }

  ws.close();
  proc.kill();
  await new Promise((r) => proc.once('exit', r));
  fs.rmSync(userDataDir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
