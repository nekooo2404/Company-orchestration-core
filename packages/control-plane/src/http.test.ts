import { describe, expect, it } from 'vitest';
import { correlationId } from '@aicompany/contracts';
import { createControlPlaneServer } from './http';
import { ControlPlaneService, HeuristicMissionPlanner, InMemoryMissionStore } from './service';
import { InMemoryModelEndpointStore } from './model-endpoints';

describe('control plane HTTP', () => {
  it('saves and reads CEO model endpoint configuration without exposing a secret value', async () => {
    const modelEndpoints = new InMemoryModelEndpointStore();
    const service = new ControlPlaneService({ planner: new HeuristicMissionPlanner(), missions: new InMemoryMissionStore() });
    const server = createControlPlaneServer(service, modelEndpoints);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/v1/model-endpoints/default`, {
        method: 'PUT', headers: { 'content-type': 'application/json', 'x-aicompany-actor': 'CEO' },
        body: JSON.stringify({ provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'deepseek-coder:33b', credentialRef: 'env:MODEL_API_KEY', timeoutMs: 120000, maxRetries: 2, circuitFailureThreshold: 3, circuitResetMs: 30000, allowInsecureLocalHttp: true })
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ model: 'deepseek-coder:33b', credentialRef: 'env:MODEL_API_KEY' });
      await expect(fetch(`http://127.0.0.1:${address.port}/v1/model-endpoints`, { headers: { 'x-aicompany-actor': 'CEO' } })).resolves.toHaveProperty('status', 200);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('serves local root info without requiring an actor header', async () => {
    const service = new ControlPlaneService({ planner: new HeuristicMissionPlanner(), missions: new InMemoryMissionStore() });
    const server = createControlPlaneServer(service);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ mode: 'local-terminal-first' });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

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
