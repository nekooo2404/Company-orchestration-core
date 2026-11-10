import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { correlationId } from '@aicompany/contracts';
import { createControlPlaneServer } from './http';
import { ControlPlaneService, HeuristicMissionPlanner, InMemoryMissionStore } from './service';
import { InMemoryModelEndpointStore } from './model-endpoints';
import { InMemoryAgentProfileStore } from './agent-profiles';
import { InMemoryAgentChatStore } from './chat';

describe('control plane HTTP', () => {
  it('saves and reads CEO model endpoint configuration without exposing a secret value', async () => {
    const provider = createServer((request, response) => {
      if (request.url === '/v1/models') { response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"data":[]}'); return; }
      response.writeHead(404); response.end();
    });
    await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', () => resolve()));
    const providerAddress = provider.address();
    if (!providerAddress || typeof providerAddress === 'string') throw new Error('Provider test server did not bind');
    const modelEndpoints = new InMemoryModelEndpointStore();
    const service = new ControlPlaneService({ planner: new HeuristicMissionPlanner(), missions: new InMemoryMissionStore() });
    const server = createControlPlaneServer(service, modelEndpoints);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/v1/model-endpoints/default`, {
        method: 'PUT', headers: { 'content-type': 'application/json', 'x-aicompany-actor': 'CEO' },
        body: JSON.stringify({ provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${providerAddress.port}/v1`, model: 'test-model', apiKey: 'secret-value', allowInsecureLocalHttp: true })
      });
      expect(response.status).toBe(200);
      const saved = await response.json() as Record<string, unknown>;
      expect(saved).toMatchObject({ provider: 'openai-compatible', model: 'test-model', credentialRef: 'env:MODEL_API_KEY', timeoutMs: 120000, maxRetries: 2 });
      expect(saved).not.toHaveProperty('apiKey');
      const listed = await fetch(`http://127.0.0.1:${address.port}/v1/model-endpoints`, { headers: { 'x-aicompany-actor': 'CEO' } });
      expect(listed.status).toBe(200);
      expect(await listed.json()).not.toEqual(expect.arrayContaining([expect.objectContaining({ apiKey: 'secret-value' })]));
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await new Promise<void>((resolve, reject) => provider.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('requires a successful provider connection before saving an endpoint', async () => {
    const provider = createServer((request, response) => {
      if (request.url === '/v1/models') { response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"data":[]}'); return; }
      response.writeHead(404); response.end();
    });
    await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', () => resolve()));
    const providerAddress = provider.address();
    if (!providerAddress || typeof providerAddress === 'string') throw new Error('Provider test server did not bind');
    const modelEndpoints = new InMemoryModelEndpointStore();
    const service = new ControlPlaneService({ planner: new HeuristicMissionPlanner(), missions: new InMemoryMissionStore() });
    const server = createControlPlaneServer(service, modelEndpoints);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    const input = { id: 'active', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${providerAddress.port}/v1`, model: 'test-model', apiKey: 'test-key', allowInsecureLocalHttp: true };
    try {
      const tested = await fetch(`http://127.0.0.1:${address.port}/v1/model-endpoints/test`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-aicompany-actor': 'CEO' }, body: JSON.stringify(input) });
      expect(tested.status).toBe(200);
      expect((await tested.json()).active).toBe(true);
      const saved = await fetch(`http://127.0.0.1:${address.port}/v1/model-endpoints/active`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-aicompany-actor': 'CEO' }, body: JSON.stringify(input) });
      expect(saved.status).toBe(200);
      const failed = await fetch(`http://127.0.0.1:${address.port}/v1/model-endpoints/offline`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-aicompany-actor': 'CEO' }, body: JSON.stringify({ ...input, id: 'offline', baseUrl: 'http://127.0.0.1:1/v1' }) });
      expect(failed.status).toBe(502);
      expect(await modelEndpoints.get('offline')).toBeNull();
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await new Promise<void>((resolve, reject) => provider.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('serves local root info without requiring an actor header', async () => {
    const service = new ControlPlaneService({ planner: new HeuristicMissionPlanner(), missions: new InMemoryMissionStore() });
    const server = createControlPlaneServer(service);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/`, { headers: { origin: 'http://localhost:3000' } });
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
      expect(await response.json()).toMatchObject({ mode: 'local-terminal-first' });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('answers the dashboard CORS preflight before actor authentication', async () => {
    const service = new ControlPlaneService({ planner: new HeuristicMissionPlanner(), missions: new InMemoryMissionStore() });
    const server = createControlPlaneServer(service);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/v1/model-endpoints/default`, { method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:3000', 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type,x-aicompany-actor' } });
      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:3000');
      expect(response.headers.get('access-control-allow-methods')).toContain('PUT');
      expect(response.headers.get('access-control-allow-headers')).toContain('x-aicompany-actor');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('allows the packaged desktop file origin', async () => {
    const service = new ControlPlaneService({ planner: new HeuristicMissionPlanner(), missions: new InMemoryMissionStore() });
    const server = createControlPlaneServer(service);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/health`, { headers: { origin: 'null' } });
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('null');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('accepts authenticated external lifecycle events without storing raw payloads', async () => {
    const service = new ControlPlaneService({ planner: new HeuristicMissionPlanner(), missions: new InMemoryMissionStore() });
    const agents = new InMemoryAgentProfileStore();
    const chats = new InMemoryAgentChatStore();
    const server = createControlPlaneServer(service, new InMemoryModelEndpointStore(), agents, chats, null, 'hook-secret');
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const send = (event: string, token = 'hook-secret') => fetch(`${baseUrl}/v1/agent-events`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-aicompany-hook-token': token }, body: JSON.stringify({ source: 'claude', event, sessionId: 'session-12345678', cwd: 'D:/Projects/QHome', prompt: 'must not persist' }) });
    try {
      expect((await send('SessionStart', 'wrong')).status).toBe(401);
      expect((await send('SessionStart')).status).toBe(202);
      expect((await agents.list())[0]).toMatchObject({ terminal: 'RUNNING', department: 'Claude' });
      expect((await send('Stop')).status).toBe(202);
      expect((await agents.list())[0]?.terminal).toBe('READY');
      expect((await send('SessionEnd')).status).toBe(202);
      expect((await agents.list())[0]?.terminal).toBe('OFFLINE');
      const messages = await chats.list('local');
      expect(messages).toHaveLength(3);
      expect(messages.map((message) => message.content)).toEqual(['[claude] SessionStart / RUNNING', '[claude] Stop / READY', '[claude] SessionEnd / OFFLINE']);
      expect(JSON.stringify(messages)).not.toContain('must not persist');
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
