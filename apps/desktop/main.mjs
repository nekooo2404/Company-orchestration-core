/* global process, fetch, setTimeout, URL */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import { homedir, extname, join, normalize, relative } from 'node:path';
import { createServer } from 'node:http';

const require = createRequire(import.meta.url);
const { app, BrowserWindow, dialog, Menu, ipcMain } = require('electron');
const pty = app?.isPackaged ? require(join(process.resourcesPath, 'runtime', 'deps', 'node-pty')) : require('node-pty');


const processes = new Set();
const terminals = new Map();
let mainWindow;
let stopping = false;
let staticServer;

const runtimeRoot = () => app.isPackaged ? join(process.resourcesPath, 'runtime') : join(app.getAppPath(), 'runtime');
const localDataDir = () => join(app.getPath('userData'), 'data');
const runNodeScript = (script, extraEnv = {}) => {
  const child = spawn(process.execPath, [script], {
    cwd: runtimeRoot(),
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[${script}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${script}] ${chunk}`));
  processes.add(child);
  child.once('exit', () => processes.delete(child));
  return child;
};

const quoteCmd = (value) => `"${String(value).replaceAll('"', '""')}"`;
const hookSettings = [
  { source: 'claude', path: join(homedir(), '.claude', 'settings.json'), events: ['SessionStart', 'UserPromptSubmit', 'Stop', 'SubagentStart', 'SubagentStop', 'Notification', 'SessionEnd'] },
  { source: 'codex', path: join(homedir(), '.codex', 'hooks.json'), events: ['SessionStart', 'UserPromptSubmit', 'Stop', 'SubagentStart', 'SubagentStop', 'Interrupt'] }
];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const installHookConfig = async ({ source, path, events }, command) => {
  if (!existsSync(path)) return;
  try {
    const original = await fs.readFile(path, 'utf8');
    const config = JSON.parse(original);
    if (!isObject(config)) return;
    const hooks = isObject(config.hooks) ? config.hooks : {};
    let changed = !isObject(config.hooks);
    const commandValue = `${quoteCmd(command)} ${source}`;
    for (const event of events) {
      const entries = Array.isArray(hooks[event]) ? hooks[event] : [];
      if (!entries.some((entry) => isObject(entry) && Array.isArray(entry.hooks) && entry.hooks.some((hook) => isObject(hook) && hook.type === 'command' && hook.command === commandValue))) {
        entries.push({ hooks: [{ type: 'command', command: commandValue, timeout: 5 }] });
        hooks[event] = entries;
        changed = true;
      }
    }
    if (!changed) return;
    config.hooks = hooks;
    const temporary = `${path}.aicompany-${process.pid}.tmp`;
    const backup = `${path}.aicompany-backup`;
    await fs.writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    await fs.copyFile(path, backup);
    try {
      await fs.copyFile(temporary, path);
      await fs.rm(backup, { force: true });
    } catch (error) {
      await fs.copyFile(backup, path).catch(() => {});
      throw error;
    } finally {
      await fs.rm(temporary, { force: true });
    }
  } catch (error) {
    process.stderr.write(`[hooks] skipped ${source}: ${error instanceof Error ? error.message : String(error)}\n`);
  }
};
const installHookAdapters = async (dataDir) => {
  await fs.mkdir(dataDir, { recursive: true });
  const tokenPath = join(dataDir, 'hook-token');
  let token = '';
  try { token = (await fs.readFile(tokenPath, 'utf8')).trim(); } catch { /* create below */ }
  if (!token) { token = randomUUID(); await fs.writeFile(tokenPath, `${token}\n`, { encoding: 'utf8', mode: 0o600 }); }
  const hookScript = app.isPackaged ? join(process.resourcesPath, 'runtime', 'agent-hook.mjs') : join(app.getAppPath(), 'agent-hook.mjs');
  const hookCommand = join(app.getPath('userData'), 'hooks', 'aicompany-agent-hook.cmd');
  await fs.mkdir(join(app.getPath('userData'), 'hooks'), { recursive: true });
  await fs.writeFile(hookCommand, [
    '@echo off',
    'set "ELECTRON_RUN_AS_NODE=1"',
    `set "AI_COMPANY_DATA_DIR=${String(dataDir).replaceAll('"', '""')}"`,
    'set "AI_COMPANY_CONTROL_URL=http://127.0.0.1:4000"',
    `${quoteCmd(process.execPath)} ${quoteCmd(hookScript)} "%~1"`,
    'exit /b 0'
  ].join('\r\n'), 'utf8');
  for (const settings of hookSettings) await installHookConfig(settings, hookCommand);
  return token;
};

const stopAll = () => {
  stopping = true;
  staticServer?.close();
  for (const child of processes) {
    if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
    else child.kill('SIGTERM');
  }
  processes.clear();
  for (const session of terminals.values()) session.pty.kill();
  terminals.clear();
};

const publicTerminal = (session) => ({ id: session.id, agentId: session.agentId, status: session.status, cwd: session.cwd, startedAt: session.startedAt });
const sendTerminalEvent = (event) => { if (!mainWindow?.isDestroyed()) mainWindow.webContents.send('terminal:event', event); };
const terminalCwd = (requested) => {
  const root = normalize(localDataDir());
  const candidate = normalize(requested ? join(root, requested) : join(root, 'workspaces'));
  if (relative(root, candidate).startsWith('..')) throw new Error('Terminal cwd must stay inside AIcompany data directory');
  return candidate;
};
const startTerminal = ({ agentId = 'agent:local-worker', cwd } = {}) => {
  const id = `terminal:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const workingDirectory = terminalCwd(cwd);
  const shell = process.env.ComSpec || 'cmd.exe';
  const args = shell.toLowerCase().includes('powershell') ? ['-NoLogo'] : [];
  const safeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(API_KEY|TOKEN|SECRET|PASSWORD)/i.test(key)));
  const session = { id, agentId, cwd: workingDirectory, status: 'RUNNING', startedAt: new Date().toISOString(), pty: pty.spawn(shell, args, { name: 'xterm-color', cols: 120, rows: 32, cwd: workingDirectory, env: { ...safeEnv, TERM: 'xterm-256color' } }) };
  session.pty.onData((data) => sendTerminalEvent({ type: 'data', session: publicTerminal(session), data }));
  session.pty.onExit(({ exitCode, signal }) => { session.status = 'CLOSED'; sendTerminalEvent({ type: 'status', session: publicTerminal(session), exitCode, signal }); });
  terminals.set(id, session);
  sendTerminalEvent({ type: 'status', session: publicTerminal(session) });
  return publicTerminal(session);
};
ipcMain.handle('terminal:list', () => [...terminals.values()].map(publicTerminal));
ipcMain.handle('terminal:start', (_event, input) => startTerminal(input));
ipcMain.handle('terminal:write', (_event, { id, data }) => { const session = terminals.get(id); if (!session || session.status !== 'RUNNING') throw new Error('Terminal session is not running'); session.pty.write(String(data ?? '')); });
ipcMain.handle('terminal:resize', (_event, { id, cols, rows }) => { const session = terminals.get(id); if (!session || session.status !== 'RUNNING') return; session.pty.resize(Math.max(40, Math.min(240, Number(cols) || 120)), Math.max(10, Math.min(100, Number(rows) || 32))); });
ipcMain.handle('terminal:close', (_event, id) => { const session = terminals.get(id); if (session) { session.pty.kill(); terminals.delete(id); } });

const waitFor = async (url, timeoutMs = 30_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { const response = await fetch(url); if (response.ok) return; } catch { continue; }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const createWindow = () => {
  const window = new BrowserWindow({ width: 1440, height: 920, minWidth: 1100, minHeight: 700, backgroundColor: '#080b10', webPreferences: { contextIsolation: true, nodeIntegration: false, preload: join(app.getAppPath(), 'preload.mjs') } });
  mainWindow = window;
  void window.loadURL('http://127.0.0.1:3000/');
  return window;
};

const mimeTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const startStaticServer = () => new Promise((resolve, reject) => {
  const root = join(runtimeRoot(), 'mission-grid');
  staticServer = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const filePath = normalize(join(root, requested));
      if (relative(root, filePath).startsWith('..')) { response.writeHead(403); response.end(); return; }
      const content = await fs.readFile(filePath);
      response.writeHead(200, { 'content-type': mimeTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(content);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  staticServer.once('error', reject);
  staticServer.listen(3000, '127.0.0.1', resolve);
});

const start = async () => {
  if (!existsSync(join(runtimeRoot(), 'apps', 'control-plane-server', 'server.mjs')) || !existsSync(join(runtimeRoot(), 'mission-grid', 'index.html'))) {
    throw new Error('Desktop runtime is not prepared. Run the desktop build pipeline first.');
  }
  const dataDir = localDataDir();
  const hookToken = await installHookAdapters(dataDir);
  runNodeScript(join('apps', 'control-plane-server', 'server.mjs'), { CONTROL_PLANE_STORAGE: 'file', LOCAL_DATA_DIR: dataDir, CONTROL_PLANE_PORT: '4000', AI_COMPANY_HOOK_TOKEN: hookToken });
  const startWorker = () => {
    if (stopping) return;
    const worker = runNodeScript(join('apps', 'local-worker', 'local-worker.mjs'), { LOCAL_DATA_DIR: dataDir, WORKER_PROJECT_ID: 'aicompany', WORKER_INTERVAL_MS: '1000' });
    worker.once('exit', () => { if (!stopping) setTimeout(startWorker, 2000); });
  };
  startWorker();
  await startStaticServer();
  await waitFor('http://127.0.0.1:4000/health');
  await waitFor('http://127.0.0.1:3000/');
  createWindow();
};

app.whenReady().then(() => { Menu.setApplicationMenu(null); return start(); }).catch(async (error) => { await dialog.showErrorBox('AIcompany could not start', error instanceof Error ? error.message : String(error)); app.quit(); });
app.on('window-all-closed', () => { stopAll(); app.quit(); });
app.on('before-quit', stopAll);
