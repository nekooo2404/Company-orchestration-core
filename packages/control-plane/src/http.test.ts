import { describe, expect, it } from 'vitest';
import { correlationId } from '@aicompany/contracts';
import { createControlPlaneServer } from './http';
import { ControlPlaneService, HeuristicMissionPlanner, InMemoryMissionStore } from './service';

describe('control plane HTTP', () => {
  it('accepts CEO brief through terminal-facing API and serves read-only status', async () => {
    const service = new ControlPlaneService({ planner: new HeuristicMissionPlanner(), missions: new InMemoryMissionStore() });
    const server = createControlPlaneServer(service);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const created = await fetch(`${baseUrl}/v1/missions`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-aicompany-actor': 'CEO' }, body: JSON.stringify({ projectId: 'terminal-project', title: 'CLI mission', brief: 'Build API', correlationId: correlationId('terminal-trace'), idempotencyKey: 'terminal-1' }) });
      expect(created.status).toBe(201);
      const mission = await created.json() as { missionId: string };
      const status = await fetch(`${baseUrl}/v1/missions/${encodeURIComponent(mission.missionId)}`, { headers: { 'x-aicompany-actor': 'CEO' } });
      expect(status.status).toBe(200);
      expect((await status.json()).missionId).toBe(mission.missionId);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
