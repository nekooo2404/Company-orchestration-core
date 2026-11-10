/* global process, fetch, setTimeout, clearTimeout, Buffer, AbortController */
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const source = process.argv[2] === 'codex' ? 'codex' : process.argv[2] === 'claude' ? 'claude' : 'generic';
const readStdin = async () => {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += Buffer.byteLength(chunk);
    if (size > 256_000) break;
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
};

const main = async () => {
  const input = await readStdin();
  const sessionId = input.sessionId ?? input.session_id ?? input.thread_id;
  if (typeof sessionId !== 'string' || !sessionId.trim()) return;
  const dataDir = process.env.AI_COMPANY_DATA_DIR;
  if (!dataDir) return;
  let token = '';
  try { token = (await fs.readFile(join(dataDir, 'hook-token'), 'utf8')).trim(); } catch { return; }
  if (!token) return;
  const event = input.event ?? input.hook_event_name ?? input.eventName ?? input.type ?? 'unknown';
  const cwd = input.cwd ?? input.current_working_directory;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    await fetch(`${process.env.AI_COMPANY_CONTROL_URL ?? 'http://127.0.0.1:4000'}/v1/agent-events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-aicompany-hook-token': token },
      body: JSON.stringify({ source, event: typeof event === 'string' ? event : 'unknown', sessionId, ...(typeof cwd === 'string' ? { cwd } : {}) }),
      signal: controller.signal
    });
  } catch { /* Hook must never block Claude or Codex. */ }
  clearTimeout(timeout);
};

await main();
