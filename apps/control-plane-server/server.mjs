import { createControlPlaneServer } from '../../packages/control-plane/dist/index.js';
import process from 'node:process';
import { env, stdout } from 'node:process';

const port = Number(env.CONTROL_PLANE_PORT ?? 4000);
const serviceModule = await import('../../packages/control-plane/dist/index.js');
const service = new serviceModule.ControlPlaneService({
  planner: new serviceModule.HeuristicMissionPlanner(),
  missions: new serviceModule.InMemoryMissionStore()
});
const server = createControlPlaneServer(service);
server.listen(port, '127.0.0.1', () => {
  stdout.write(`AIcompany Control Plane listening on http://127.0.0.1:${port}\n`);
});

const shutdown = () => server.close(() => process.exit(0));
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
