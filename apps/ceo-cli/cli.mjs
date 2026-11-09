import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { argv, env, stderr, stdout } from 'node:process';

const args = argv.slice(2);
const [resource, action, ...rest] = args;
const baseUrl = env.CONTROL_PLANE_URL ?? 'http://127.0.0.1:4000';

const usage = () => {
  stdout.write(`CEO terminal

  corepack pnpm ceo mission submit --project <id> --title <title> --brief <text>
  corepack pnpm ceo mission submit --project <id> --title <title> --brief-file <path>
  corepack pnpm ceo mission list --project <id>
  corepack pnpm ceo mission status <mission-id>
  corepack pnpm ceo mission watch <mission-id> [--interval <ms>]

Dashboard only observes. Commands run here.\n`);
};

const flag = (name, fallback = undefined) => {
  const index = rest.indexOf(name);
  return index === -1 ? fallback : rest[index + 1];
};

const request = async (path, init = {}) => {
  const response = await globalThis.fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), 'x-aicompany-actor': 'CEO', 'content-type': 'application/json' }
  });
  const text = await response.text();
  let value;
  try { value = text ? JSON.parse(text) : null; } catch { value = { error: text }; }
  if (!response.ok) throw new Error(`${response.status}: ${value?.error ?? 'Control Plane request failed'}`);
  return value;
};

const print = (value) => stdout.write(`${JSON.stringify(value, null, 2)}\n`);

const submit = async () => {
  const projectId = flag('--project');
  const title = flag('--title');
  const briefFile = flag('--brief-file');
  const brief = briefFile ? await readFile(briefFile, 'utf8') : flag('--brief');
  if (!projectId || !title || !brief) throw new Error('--project, --title, and --brief/--brief-file are required');
  const idempotencyKey = flag('--idempotency-key', `terminal-${Date.now()}`);
  const correlationId = flag('--correlation-id', `terminal-trace-${Date.now()}`);
  print(await request('/v1/missions', { method: 'POST', body: JSON.stringify({ projectId, title, brief, idempotencyKey, correlationId }) }));
};

const list = async () => print(await request(`/v1/missions?projectId=${encodeURIComponent(flag('--project') ?? '')}`, { method: 'GET' }));
const status = async () => print(await request(`/v1/missions/${encodeURIComponent(rest[0])}`, { method: 'GET' }));
const watch = async () => {
  const missionId = rest[0];
  const interval = Number(flag('--interval', '2000'));
  if (!missionId || !Number.isFinite(interval) || interval < 250) throw new Error('mission-id and interval >= 250 are required');
  let watching = true;
  while (watching) { stdout.write('\u001b[2J\u001b[H'); print(await request(`/v1/missions/${encodeURIComponent(missionId)}`, { method: 'GET' })); await new Promise((resolve) => globalThis.setTimeout(resolve, interval)); }
};

const main = async () => {
  if (resource !== 'mission') { usage(); return; }
  if (action === 'submit') await submit();
  else if (action === 'list') await list();
  else if (action === 'status') await status();
  else if (action === 'watch') await watch();
  else usage();
};

try { await main(); }
catch (error) {
  stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
