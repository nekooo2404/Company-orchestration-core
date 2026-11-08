import {
  AgentSessionSchema,
  DomainEventSchema,
  agentSessionId,
  eventId,
  type AgentDefinitionId,
  type AgentSession,
  type AgentSessionId,
  type CorrelationId,
  type TaskId
} from '@aicompany/contracts';
import type { Clock } from './leases';
import { InvalidTaskTransitionError } from './domain-errors';
import type { CheckpointStore, AgentCheckpoint, AgentCheckpointState } from './checkpoints';
import type { AgentSessionRepository, SessionCommandSink } from './session-commands';
import type { TaskRepository } from './repository';
import { transitionTask } from './task-state-machine';

export interface StartSessionInput {
  taskId: TaskId;
  leaseId: string;
  agentDefinitionId: AgentDefinitionId;
  correlationId: CorrelationId;
}

export interface SaveCheckpointInput {
  sessionId: AgentSessionId;
  expectedSequence: number;
  state: AgentCheckpointState;
  contextReference: string;
  lastEventId: ReturnType<typeof eventId>;
  completedOperationKeys: string[];
}

export interface AgentSessionManager {
  start(input: StartSessionInput): Promise<AgentSession>;
  checkpoint(input: SaveCheckpointInput): Promise<AgentCheckpoint>;
  resume(sessionId: AgentSessionId): Promise<AgentSession>;
  pause(sessionId: AgentSessionId, reason: string): Promise<void>;
  cancel(sessionId: AgentSessionId, reason: string): Promise<void>;
}

export interface AgentSessionManagerOptions {
  taskRepository: TaskRepository;
  sessionRepository: AgentSessionRepository;
  checkpointStore: CheckpointStore;
  lifecyclePersistence: SessionLifecyclePersistence;
  commandSink: SessionCommandSink;
  clock: Clock;
  idFactory?: (attempt: number) => AgentSessionId;
  eventIdFactory?: () => ReturnType<typeof eventId>;
  hasPendingCleanup?: (sessionId: AgentSessionId) => boolean | Promise<boolean>;
}

export interface SessionLifecyclePersistence {
  start(input: { task: import('@aicompany/contracts').Task; expectedTaskVersion: number; session: AgentSession }): Promise<void>;
  cancel(input: { task: import('@aicompany/contracts').Task; expectedTaskVersion: number; session: AgentSession; expectedSessionVersion: number; event: import('@aicompany/contracts').DomainEvent }): Promise<void>;
  transition(input: { session: AgentSession; expectedSessionVersion: number; event: import('@aicompany/contracts').DomainEvent }): Promise<void>;
}

const actor = { kind: 'SYSTEM' as const, name: 'agent-session-manager' };

export class AgentSessionManagerService implements AgentSessionManager {
  private nextSession = 0;
  private nextEvent = 0;

  public constructor(private readonly options: AgentSessionManagerOptions) {}

  public async start(input: StartSessionInput): Promise<AgentSession> {
    if (!input.leaseId.trim()) throw new Error('A valid lease is required to start a session');
    const task = await this.options.taskRepository.get(input.taskId);
    if (!task) throw new Error(`Task ${input.taskId} does not exist`);
    if (task.state !== 'READY') throw new InvalidTaskTransitionError(task.id, task.state, 'TASK_STARTED');
    const now = this.options.clock.now();
    const sessionId = this.newSessionId(1);
    const transitioned = transitionTask(task, { type: 'TASK_STARTED', sessionId }, {
      actor, now, evidenceIds: [], isDeployment: task.isDeployment ?? false
    });
    const session = AgentSessionSchema.parse({
      sessionId, taskId: task.id, workflowId: task.workflowId,
      agentDefinitionId: input.agentDefinitionId, state: 'RUNNING',
      contextReference: `session:${sessionId}`, checkpointReference: null,
      traceId: input.correlationId, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      toolCallHistory: [], attempt: 1, version: 0, createdAt: now, updatedAt: now
    });
    await this.options.lifecyclePersistence.start({ task: transitioned.task, expectedTaskVersion: task.version, session });
    await this.options.commandSink.emit({
      commandId: `start-agent-session:${sessionId}:attempt:1`, type: 'START_AGENT_SESSION',
      payload: { taskId: task.id, workflowId: task.workflowId, agentDefinitionId: input.agentDefinitionId,
        leaseId: input.leaseId, idempotencyKey: sessionId, attempt: 1, completedOperationKeys: [] },
      correlationId: input.correlationId, causationId: transitioned.event.eventId, issuedAt: now
    });
    return session;
  }

  public async checkpoint(input: SaveCheckpointInput): Promise<AgentCheckpoint> {
    const session = await this.requireSession(input.sessionId);
    const latest = await this.options.checkpointStore.latest(input.sessionId);
    const current = latest?.sequence ?? 0;
    if (input.expectedSequence !== current) throw new Error(`Checkpoint sequence conflict: expected ${input.expectedSequence}, actual ${current}`);
    const checkpoint: AgentCheckpoint = {
      sessionId: session.sessionId, taskId: session.taskId, sequence: current + 1,
      state: input.state, contextReference: input.contextReference,
      lastEventId: input.lastEventId, completedOperationKeys: [...new Set(input.completedOperationKeys)],
      createdAt: this.options.clock.now()
    };
    await this.options.checkpointStore.save(checkpoint);
    const updated = { ...session, state: input.state, contextReference: input.contextReference,
      checkpointReference: `${session.sessionId}:checkpoint:${checkpoint.sequence}`,
      version: session.version + 1, updatedAt: checkpoint.createdAt };
    await this.options.sessionRepository.save(updated, session.version);
    return checkpoint;
  }

  public async resume(sessionId: AgentSessionId): Promise<AgentSession> {
    const session = await this.requireSession(sessionId);
    if (session.state === 'CANCELLED') throw new Error('A cancelled session cannot be resumed');
    if (session.state !== 'PAUSED' && session.state !== 'WAITING_FOR_TOOL' && session.state !== 'RUNNING') {
      throw new Error(`Session in ${session.state} cannot be resumed`);
    }
    const task = await this.options.taskRepository.get(session.taskId);
    if (!task || task.workflowId !== session.workflowId || !['RUNNING', 'READY'].includes(task.state)) {
      throw new Error('Session task or workflow is no longer active');
    }
    const checkpoint = await this.options.checkpointStore.latest(sessionId);
    if (!checkpoint) throw new Error('Cannot resume without a checkpoint');
    const attempt = (session.attempt ?? 1) + 1;
    const now = this.options.clock.now();
    const updated = AgentSessionSchema.parse({ ...session, state: 'RUNNING', attempt,
      version: session.version + 1, updatedAt: now });
    const causationId = this.newEventId();
    const event = DomainEventSchema.parse({ eventId: causationId, aggregateType: 'AGENT_SESSION',
      aggregateId: sessionId, aggregateVersion: updated.version, eventType: 'AGENT_SESSION_RESUMED', actor,
      correlationId: session.traceId, causationId: checkpoint.lastEventId, occurredAt: now,
      payload: { sessionId } });
    await this.options.lifecyclePersistence.transition({ session: updated, expectedSessionVersion: session.version, event });
    await this.options.commandSink.emit({
      commandId: `start-agent-session:${sessionId}:attempt:${attempt}`, type: 'START_AGENT_SESSION',
      payload: { taskId: session.taskId, workflowId: session.workflowId,
        agentDefinitionId: session.agentDefinitionId, leaseId: `resume:${sessionId}:${attempt}`,
        idempotencyKey: sessionId, attempt, completedOperationKeys: [...checkpoint.completedOperationKeys] },
      correlationId: session.traceId, causationId, issuedAt: now
    });
    return updated;
  }

  public async pause(sessionId: AgentSessionId, reason: string): Promise<void> {
    if (!reason.trim()) throw new Error('Pause reason is required');
    const session = await this.requireSession(sessionId);
    if (session.state === 'PAUSED') return;
    if (!['RUNNING', 'WAITING_FOR_TOOL'].includes(session.state)) throw new Error(`Session in ${session.state} cannot be paused`);
    const now = this.options.clock.now();
    const updated = AgentSessionSchema.parse({ ...session, state: 'PAUSED', version: session.version + 1, updatedAt: now });
    const latest = await this.options.checkpointStore.latest(sessionId);
    const event = DomainEventSchema.parse({ eventId: this.newEventId(), aggregateType: 'AGENT_SESSION',
      aggregateId: sessionId, aggregateVersion: updated.version, eventType: 'AGENT_SESSION_PAUSED', actor,
      correlationId: session.traceId, causationId: latest?.lastEventId ?? this.newEventId(), occurredAt: now,
      payload: { sessionId, reason } });
    await this.options.lifecyclePersistence.transition({ session: updated, expectedSessionVersion: session.version, event });
  }

  public async cancel(sessionId: AgentSessionId, reason: string): Promise<void> {
    if (!reason.trim()) throw new Error('Cancellation reason is required');
    const session = await this.requireSession(sessionId);
    if (session.state === 'CANCELLED') return;
    if (await this.options.hasPendingCleanup?.(sessionId)) throw new Error('Session cancellation is blocked while dependent cleanup is pending');
    const task = await this.options.taskRepository.get(session.taskId);
    if (!task) throw new Error(`Task ${session.taskId} does not exist`);
    const now = this.options.clock.now();
    const transitioned = transitionTask(task, { type: 'TASK_CANCELLED', reason }, {
      actor, now, evidenceIds: [], isDeployment: task.isDeployment ?? false
    });
    const event = DomainEventSchema.parse({
      eventId: this.newEventId(), aggregateType: 'AGENT_SESSION', aggregateId: session.sessionId,
      aggregateVersion: session.version + 1, eventType: 'AGENT_SESSION_CANCELLED',
      actor, correlationId: session.traceId, causationId: transitioned.event.eventId, occurredAt: now,
      payload: { sessionId, reason }
    });
    const cancelledSession = AgentSessionSchema.parse({ ...session, state: 'CANCELLED', version: session.version + 1, updatedAt: now });
    await this.options.lifecyclePersistence.cancel({ task: transitioned.task, expectedTaskVersion: task.version,
      session: cancelledSession, expectedSessionVersion: session.version, event });
  }

  private async requireSession(sessionId: AgentSessionId): Promise<AgentSession> {
    const session = await this.options.sessionRepository.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} does not exist`);
    return session;
  }

  private newSessionId(attempt: number): AgentSessionId {
    this.nextSession += 1;
    return this.options.idFactory?.(attempt) ?? agentSessionId(`agent-session-${this.nextSession}`);
  }

  private newEventId() {
    this.nextEvent += 1;
    return this.options.eventIdFactory?.() ?? eventId(`agent-session-event-${this.nextEvent}`);
  }
}
