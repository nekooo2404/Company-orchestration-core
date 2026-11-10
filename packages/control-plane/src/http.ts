import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { agentSessionId, type ActorRef } from '@aicompany/contracts';
import { OpenAICompatibleGateway } from '@aicompany/model-gateway';
import type { ControlPlaneService } from './service.js';
import { InMemoryModelEndpointStore, validateModelEndpoint, type ModelEndpointInput, type ModelEndpointStore, type StoredModelEndpoint } from './model-endpoints.js';
import { InMemoryAgentProfileStore, type AgentProfile, type AgentProfileStore } from './agent-profiles.js';
import { InMemoryAgentChatStore, type AgentChatStore } from './chat.js';
import { grantLocalAccessRoot, listLocalAccessRoots } from './local-access.js';
import { eventMessage, normalizeAgentEvent } from './agent-events.js';

const actorFrom = (request: IncomingMessage): ActorRef => {
  const value = request.headers['x-aicompany-actor'];
  if (value === 'CEO') return { kind: 'CEO' };
  if (typeof value === 'string' && value.startsWith('AGENT:')) return { kind: 'AGENT', sessionId: agentSessionId(value.slice(6)) };
  throw new Error('Missing or invalid x-aicompany-actor');
};

const body = async (request: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { size += Buffer.byteLength(chunk); if (size > 1_000_000) throw new Error('Request body exceeds 1 MB'); chunks.push(Buffer.from(chunk)); }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Request body must be a JSON object');
  return parsed as Record<string, unknown>;
};

const localOrigin = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
const configureCors = (request: IncomingMessage, response: ServerResponse): boolean => {
  const origin = request.headers.origin;
  if (origin !== 'null' && (typeof origin !== 'string' || !localOrigin.test(origin))) return typeof origin !== 'string';
  response.setHeader('access-control-allow-origin', origin);
  response.setHeader('access-control-allow-methods', 'GET,POST,PUT,OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type,x-aicompany-actor,x-aicompany-hook-token');
  response.setHeader('access-control-max-age', '600');
  response.setHeader('vary', 'Origin');
  return true;
};

const send = (response: ServerResponse, status: number, value: unknown): void => { response.statusCode = status; response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(value)); };
const publicEndpoint = (endpoint: StoredModelEndpoint | null): unknown => {
  if (endpoint === null) return null;
  const safe = { ...endpoint };
  delete safe.apiKey;
  return safe;
};

const normalizeEndpoint = (id: string, input: Record<string, unknown>, stored?: StoredModelEndpoint | null): ModelEndpointInput => ({
  ...(stored ?? {}),
  ...input,
  id,
  provider: input.provider ?? stored?.provider ?? 'openai-compatible',
  credentialRef: input.credentialRef ?? stored?.credentialRef ?? 'env:MODEL_API_KEY',
  timeoutMs: input.timeoutMs ?? stored?.timeoutMs ?? 120000,
  maxRetries: input.maxRetries ?? stored?.maxRetries ?? 2,
  circuitFailureThreshold: input.circuitFailureThreshold ?? stored?.circuitFailureThreshold ?? 3,
  circuitResetMs: input.circuitResetMs ?? stored?.circuitResetMs ?? 30000,
  allowInsecureLocalHttp: input.allowInsecureLocalHttp ?? stored?.allowInsecureLocalHttp ?? false
} as ModelEndpointInput);

const testEndpoint = async (input: ModelEndpointInput, stored?: StoredModelEndpoint | null) => {
  const config = validateModelEndpoint(input);
  const secret = input.apiKey?.trim() || stored?.apiKey || (config.credentialRef.startsWith('env:') ? process.env[config.credentialRef.slice(4)] ?? '' : '');
  const gateway = new OpenAICompatibleGateway({
    endpoints: [config],
    secrets: { async resolve() { return secret; } }
  });
  return gateway.health(config.id);
};

export const parseActor = actorFrom;

export const createControlPlaneServer = (service: ControlPlaneService, modelEndpoints: ModelEndpointStore = new InMemoryModelEndpointStore(), agents: AgentProfileStore = new InMemoryAgentProfileStore(), chats: AgentChatStore = new InMemoryAgentChatStore(), accessGrantFile: string | null = null, hookToken: string | null = process.env.AI_COMPANY_HOOK_TOKEN?.trim() || null): Server => createServer(async (request, response) => {
  try {
    if (!configureCors(request, response)) return send(response, 403, { error: 'Origin is not allowed' });
    if (request.method === 'OPTIONS') { response.statusCode = 204; return response.end(); }
    if (request.method === 'GET' && request.url === '/health') return send(response, 200, { status: 'ok' });
    if (request.method === 'GET' && request.url === '/') return send(response, 200, {
      service: 'AIcompany Control Plane',
      mode: 'local-terminal-first',
      dashboard: 'http://127.0.0.1:3000',
      cli: 'corepack pnpm ceo mission --help',
      actorHeader: 'x-aicompany-actor: CEO'
    });
    if (request.method === 'POST' && request.url === '/v1/agent-events') {
      const receivedToken = request.headers['x-aicompany-hook-token'];
      if (!hookToken || typeof receivedToken !== 'string' || receivedToken !== hookToken) return send(response, 401, { error: 'Invalid hook token' });
      const event = normalizeAgentEvent(await body(request));
      const current = await agents.get(event.agentId);
      const endpointId = current?.endpointId ?? (await modelEndpoints.list())[0]?.id ?? 'default';
      const profile: AgentProfile = {
        id: event.agentId,
        name: current?.name ?? `${event.source === 'claude' ? 'Claude' : event.source === 'codex' ? 'Codex' : 'External'} session ${event.sessionId.slice(0, 8)}`,
        role: current?.role ?? 'Dev',
        department: current?.department ?? (event.source === 'generic' ? 'External' : event.source[0].toUpperCase() + event.source.slice(1)),
        endpointId,
        accessRoots: current?.accessRoots ?? [],
        terminal: event.status
      };
      await agents.save(profile);
      await chats.append({ id: `event:${Date.now()}`, workflowId: 'local', agentId: event.agentId, role: 'SYSTEM', content: eventMessage(event), createdAt: new Date().toISOString() });
      return send(response, 202, { accepted: true, profile });
    }
    const actor = actorFrom(request);
    if (request.method === 'GET' && request.url === '/v1/model-endpoints') {
      if (actor.kind !== 'CEO') return send(response, 403, { error: 'Only CEO may view model endpoints' });
      const endpoints = await Promise.all((await modelEndpoints.list()).map(async (endpoint) => {
        const stored = await modelEndpoints.get(endpoint.id);
        const health = await testEndpoint({ ...endpoint, ...(stored?.apiKey ? { apiKey: stored.apiKey } : {}) }, stored).catch(() => ({ healthy: false }));
        return { ...(publicEndpoint(endpoint as StoredModelEndpoint) as Record<string, unknown>), active: health.healthy, status: health.healthy ? 'ACTIVE' : 'OFFLINE' };
      }));
      return send(response, 200, endpoints);
    }
    if (request.method === 'GET' && request.url === '/v1/agents') { if (actor.kind !== 'CEO') return send(response, 403, { error: 'Only CEO may view agents' }); return send(response, 200, await agents.list()); }
    const agentMatch = request.url?.match(/^\/v1\/agents\/([^/]+)$/);
    if (request.method === 'PUT' && agentMatch) { if (actor.kind !== 'CEO') return send(response, 403, { error: 'Only CEO may configure agents' }); const input = await body(request); const profile = { ...input, id: decodeURIComponent(agentMatch[1]), terminal: input.terminal ?? 'READY', accessRoots: Array.isArray(input.accessRoots) ? input.accessRoots : [] } as AgentProfile; await agents.save(profile); return send(response, 200, profile); }
    if (request.method === 'GET' && request.url?.startsWith('/v1/chat?')) { if (actor.kind !== 'CEO') return send(response, 403, { error: 'Only CEO may view chat' }); const workflowId = new URL(request.url, 'http://control-plane').searchParams.get('workflowId'); if (!workflowId) return send(response, 400, { error: 'workflowId is required' }); return send(response, 200, await chats.list(workflowId)); }
    if (request.method === 'POST' && request.url === '/v1/chat') { if (actor.kind !== 'CEO') return send(response, 403, { error: 'Only CEO may send chat' }); const input = await body(request); const content = String(input.content ?? '').trim(); if (!content) return send(response, 400, { error: 'content is required' }); const message = { id: `chat:${Date.now()}`, workflowId: String(input.workflowId ?? 'local'), agentId: String(input.agentId ?? 'ceo'), role: 'CEO' as const, content, createdAt: new Date().toISOString() }; await chats.append(message); return send(response, 201, message); }
    if (request.method === 'GET' && request.url === '/v1/access-roots') { if (actor.kind !== 'CEO') return send(response, 403, { error: 'Only CEO may view access roots' }); return send(response, 200, accessGrantFile ? await listLocalAccessRoots(accessGrantFile) : []); }
    if (request.method === 'POST' && request.url === '/v1/access-roots') { if (actor.kind !== 'CEO') return send(response, 403, { error: 'Only CEO may grant access roots' }); if (!accessGrantFile) return send(response, 503, { error: 'Local access storage is unavailable' }); const input = await body(request); await grantLocalAccessRoot(accessGrantFile, String(input.id ?? '')); return send(response, 200, await listLocalAccessRoots(accessGrantFile)); }
    if (request.method === 'POST' && request.url === '/v1/model-endpoints/test') {
      if (actor.kind !== 'CEO') return send(response, 403, { error: 'Only CEO may test model endpoints' });
      const input = await body(request);
      const id = typeof input.id === 'string' ? input.id : 'default';
      const stored = await modelEndpoints.get(id);
      const normalized = normalizeEndpoint(id, input, stored);
      const health = await testEndpoint(normalized, stored);
      if (!health.healthy) return send(response, 502, { error: health.reason ?? `Model endpoint returned HTTP ${health.status ?? 'unknown'}`, active: false, health });
      return send(response, 200, { active: true, health, endpoint: publicEndpoint({ ...validateModelEndpoint(normalized), ...(normalized.apiKey ? { apiKey: normalized.apiKey } : {}) }) });
    }
    const endpointMatch = request.url?.match(/^\/v1\/model-endpoints\/([^/]+)$/);
    if (request.method === 'PUT' && endpointMatch) {
      if (actor.kind !== 'CEO') return send(response, 403, { error: 'Only CEO may configure model endpoints' });
      const input = await body(request);
      const id = decodeURIComponent(endpointMatch[1]);
      const stored = await modelEndpoints.get(id);
      const normalized = normalizeEndpoint(id, input, stored);
      const health = await testEndpoint(normalized, stored);
      if (!health.healthy) return send(response, 502, { error: health.reason ?? `Model endpoint returned HTTP ${health.status ?? 'unknown'}`, active: false, health });
      await modelEndpoints.save(normalized);
      return send(response, 200, publicEndpoint(await modelEndpoints.get(id)));
    }
    if (request.method === 'POST' && request.url === '/v1/missions') { const input = await body(request); return send(response, 201, await service.submit({ ...input, requestedBy: actor } as never)); }
    if (request.method === 'GET' && request.url?.startsWith('/v1/missions?')) { const projectId = new URL(request.url, 'http://control-plane').searchParams.get('projectId'); if (!projectId) return send(response, 400, { error: 'projectId is required' }); return send(response, 200, await service.list(projectId, actor)); }
    const missionMatch = request.url?.match(/^\/v1\/missions\/([^/]+)$/);
    if (request.method === 'GET' && missionMatch) return send(response, 200, await service.get(decodeURIComponent(missionMatch[1]), actor));
    return send(response, 404, { error: 'not_found' });
  } catch (error) { send(response, error instanceof Error && /authorized|actor/i.test(error.message) ? 403 : 400, { error: error instanceof Error ? error.message : 'request_failed' }); }
});
