import { createControlPlaneServer } from '../../packages/control-plane/dist/index.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { env, stdout } from 'node:process';

const port = Number(env.CONTROL_PLANE_PORT ?? 4000);
const serviceModule = await import('../../packages/control-plane/dist/index.js');
const storage = env.CONTROL_PLANE_STORAGE ?? (env.DATABASE_URL ? 'postgres' : 'memory');
let closeStorage = async () => {};
let missions;
if (storage === 'postgres') {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required when CONTROL_PLANE_STORAGE=postgres');
  const persistenceModule = await import('../../packages/persistence-postgres/dist/index.js');
  const postgres = persistenceModule.PostgresMissionStore.connect(env.DATABASE_URL);
  const migration = await readFile(fileURLToPath(new URL('../../packages/persistence-postgres/migrations/001_orchestration.sql', import.meta.url)), 'utf8');
  await postgres.migrate(migration);
  missions = postgres;
  closeStorage = () => postgres.close();
} else if (storage === 'memory') {
  missions = new serviceModule.InMemoryMissionStore();
} else {
  throw new Error(`Unsupported CONTROL_PLANE_STORAGE: ${storage}`);
}
const service = new serviceModule.ControlPlaneService({
  planner: new serviceModule.HeuristicMissionPlanner(),
  missions
});
const server = createControlPlaneServer(service);
server.listen(port, '127.0.0.1', () => {
  stdout.write(`AIcompany Control Plane listening on http://127.0.0.1:${port}\n`);
});

const shutdown = () => server.close(async () => { await closeStorage(); process.exit(0); });
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
