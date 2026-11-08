import {
  AgentSessionSchema,
  type AgentSession,
  type AgentSessionId,
  type CorrelationId,
  type EventId
} from '@aicompany/contracts';
import { OptimisticConcurrencyError } from './repository';

export interface AgentSessionRepository {
  get(sessionId: AgentSessionId): Promise<AgentSession | null>;
  save(session: AgentSession, expectedVersion: number): Promise<void>;
}

export class InMemoryAgentSessionRepository implements AgentSessionRepository {
  private readonly sessions = new Map<AgentSessionId, AgentSession>();

  public async get(sessionId: AgentSessionId): Promise<AgentSession | null> {
    const session = this.sessions.get(sessionId);
    return session ? globalThis.structuredClone(session) : null;
  }

  public async save(input: AgentSession, expectedVersion: number): Promise<void> {
    const session = AgentSessionSchema.parse(input);
    const existing = this.sessions.get(session.sessionId);
    if (!existing) {
      if (expectedVersion !== 0 || session.version !== 0) throw new OptimisticConcurrencyError(session.sessionId, expectedVersion, 0);
    } else {
      if (existing.version !== expectedVersion) throw new OptimisticConcurrencyError(session.sessionId, expectedVersion, existing.version);
      if (session.version !== expectedVersion + 1) throw new Error(`Session ${session.sessionId} must advance to version ${expectedVersion + 1}`);
    }
    this.sessions.set(session.sessionId, globalThis.structuredClone(session));
  }
}

export interface SessionLifecycleCommand {
  commandId: string;
  type: 'START_AGENT_SESSION';
  payload: {
    taskId: AgentSession['taskId'];
    workflowId: AgentSession['workflowId'];
    agentDefinitionId: AgentSession['agentDefinitionId'];
    leaseId: string;
    idempotencyKey: AgentSessionId;
    attempt: number;
    completedOperationKeys: string[];
  };
  correlationId: CorrelationId;
  causationId: EventId;
  issuedAt: Date;
}

export interface SessionCommandSink {
  emit(command: SessionLifecycleCommand): Promise<void>;
}
