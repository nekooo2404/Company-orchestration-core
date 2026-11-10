import { createHash } from 'node:crypto';

export type AgentEventSource = 'claude' | 'codex' | 'generic';
export type AgentEventStatus = 'RUNNING' | 'READY' | 'OFFLINE';

export interface AgentEvent {
  source: AgentEventSource;
  event: string;
  sessionId: string;
  cwd?: string;
  status: AgentEventStatus;
  agentId: string;
}

const text = (value: unknown, limit: number): string => typeof value === 'string' ? value.trim().slice(0, limit) : '';

const sourceOf = (value: unknown): AgentEventSource => value === 'claude' || value === 'codex' ? value : 'generic';

const statusOf = (event: string, value: unknown): AgentEventStatus => {
  if (value === 'RUNNING' || value === 'READY' || value === 'OFFLINE') return value;
  if (['SessionEnd', 'Interrupt', 'StopFailure'].includes(event)) return 'OFFLINE';
  if (['Stop', 'Notification', 'PermissionRequest'].includes(event)) return 'READY';
  return 'RUNNING';
};

export const normalizeAgentEvent = (input: Record<string, unknown>): AgentEvent => {
  const source = sourceOf(input.source);
  const event = text(input.event ?? input.hook_event_name ?? input.eventName ?? input.type, 80) || 'unknown';
  const sessionId = text(input.sessionId ?? input.session_id ?? input.thread_id, 256);
  if (!sessionId) throw new Error('sessionId is required');
  return {
    source,
    event,
    sessionId,
    ...(text(input.cwd ?? input.current_working_directory, 512) ? { cwd: text(input.cwd ?? input.current_working_directory, 512) } : {}),
    status: statusOf(event, input.status),
    agentId: `external:${source}:${createHash('sha256').update(sessionId).digest('hex').slice(0, 16)}`
  };
};

export const eventMessage = (event: AgentEvent): string => `[${event.source}] ${event.event} / ${event.status}`;
