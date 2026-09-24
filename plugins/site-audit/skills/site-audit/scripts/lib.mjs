// Shared helpers: project config, headless Chrome over CDP (no dependencies, Node >= 22).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_PRIVATE = ['/admin', '/api', '/login', '/logout', '/signin', '/signup', '/register',
  '/dashboard', '/account', '/auth', '/panel', '/settings', '/checkout', '/cart', '/preview', '/draft'];

/** Load <repo>/.site-audit.json (all keys optional). */
export function loadConfig(repo) {
  const base = { ignorePaths: [], sourceDirs: [], privateRoutes: [], pages: [], maxPages: 12,
    accepted: [], reportDir: 'docs/audit', localUrl: null, launchConfig: null, viewports: null };
  if (!repo) return base;
  const f = join(repo, '.site-audit.json');
  if (!existsSync(f)) return base;
  try { return { ...base, ...JSON.parse(readFileSync(f, 'utf8')) }; }
  catch (e) { console.error(`! .site-audit.json unreadable: ${e.message}`); return base; }
}

export function isPrivate(path, cfg, robotsDisallow = []) {
  const list = [...DEFAULT_PRIVATE, ...cfg.privateRoutes, ...robotsDisallow].filter((p) => p && p !== '/');
  return list.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : p + '/') || (p.endsWith('*') && path.startsWith(p.slice(0, -1))));
}

/** Accepted exceptions: [{ id: "2.2", match?: "substring of message or url", reason, until?: "YYYY-MM-DD" }] */
export function acceptedFor(issue, cfg) {
  const today = new Date().toISOString().slice(0, 10);
  return cfg.accepted.find((a) => a.id === issue.id && (!a.until || a.until >= today) &&
    (!a.match || (issue.msg + ' ' + (issue.url || '')).toLowerCase().includes(a.match.toLowerCase())));
}

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

export async function launchChrome() {
  const bin = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!bin) throw new Error('No Chrome/Chromium found — set CHROME_PATH');
  const dir = mkdtempSync(join(tmpdir(), 'site-audit-chrome-'));
  const proc = spawn(bin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--mute-audio', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  const ws = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Chrome did not start in 20s')), 20000);
    proc.stderr.on('data', (d) => { const m = String(d).match(/ws:\/\/\S+/); if (m) { clearTimeout(t); resolve(m[0]); } });
    proc.on('exit', (c) => reject(new Error(`Chrome exited (${c})`)));
  });
  const port = new URL(ws).port;
  return {
    port,
    async newTab() {
      const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
      const t = await r.json();
      const c = await connect(t.webSocketDebuggerUrl);
      c.close = async () => { try { c.ws.close(); await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`); } catch {} };
      return c;
    },
    close() { proc.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch {} },
  };
}

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else listeners.forEach((l) => l(m));
  };
  return new Promise((resolve, reject) => {
    ws.onerror = () => reject(new Error('CDP websocket error'));
    ws.onopen = () => resolve({
      ws,
      send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }),
      on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
      waitFor: (method, ms) => new Promise((res) => {
        const off = (() => { const f = (m) => { if (m.method === method) { clearTimeout(t); listeners.delete(f); res(true); } }; listeners.add(f); return f; })();
        const t = setTimeout(() => { listeners.delete(off); res(false); }, ms);
      }),
    });
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
