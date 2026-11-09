import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { agentSessionId, type ActorRef } from '@aicompany/contracts';
import type { ControlPlaneService } from './service.js';

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

const send = (response: ServerResponse, status: number, value: unknown): void => { response.statusCode = status; response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(value)); };

export const parseActor = actorFrom;

export const createControlPlaneServer = (service: ControlPlaneService): Server => createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') return send(response, 200, { status: 'ok' });
    const actor = actorFrom(request);
    if (request.method === 'POST' && request.url === '/v1/missions') { const input = await body(request); return send(response, 201, await service.submit({ ...input, requestedBy: actor } as never)); }
    if (request.method === 'GET' && request.url?.startsWith('/v1/missions?')) { const projectId = new URL(request.url, 'http://control-plane').searchParams.get('projectId'); if (!projectId) return send(response, 400, { error: 'projectId is required' }); return send(response, 200, await service.list(projectId, actor)); }
    const missionMatch = request.url?.match(/^\/v1\/missions\/([^/]+)$/);
    if (request.method === 'GET' && missionMatch) return send(response, 200, await service.get(decodeURIComponent(missionMatch[1]), actor));
    return send(response, 404, { error: 'not_found' });
  } catch (error) { send(response, error instanceof Error && /authorized|actor/i.test(error.message) ? 403 : 400, { error: error instanceof Error ? error.message : 'request_failed' }); }
});
