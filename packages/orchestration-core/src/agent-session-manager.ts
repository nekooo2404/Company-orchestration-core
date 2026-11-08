import {
  AgentSessionSchema,
  DomainEventSchema,
  agentSessionId,
  eventId,
  type AgentDefinitionId,
  type AgentSession,
  type AgentSessionId,
  type CorrelationId,
  type OutboxCommand,
  type TaskId
} from '@aicompany/contracts';
import type { Clock } from './leases';
import { InvalidTaskTransitionError } from './domain-errors';
import type { CheckpointStore, AgentCheckpoint, AgentCheckpointState } from './checkpoints';
import type { AgentSessionRepository, SessionLifecyclePersistence, WorkflowStatusReader } from './session-commands';
import type { TaskRepository } from './repository';
import type { DispatchClaimStore } from './ports';
import { OptimisticConcurrencyError } from './repository';
import { transitionTask } from './task-state-machine';

export interface StartSessionInput {
  taskId: TaskId;
  leaseId: string;
  agentDefinitionId: AgentDefinitionId;
  correlationId: CorrelationId;
  expectedTaskVersion?: number;
  idempotencyKey: string;
}

export interface SaveCheckpointInput {
  sessionId: AgentSessionId;
  expectedSequence: number;
  state: AgentCheckpointState;
  contextReference: string;
  lastEventId: ReturnType<typeof eventId>;
  completedOperationKeys: string[];
  expectedSessionVersion?: number;
  idempotencyKey?: string;
}

export interface LifecycleCommandOptions {
  expectedVersion?: number;
  idempotencyKey?: string;
}

export interface AgentSessionManager {
  start(input: StartSessionInput): Promise<AgentSession>;
  checkpoint(input: SaveCheckpointInput): Promise<AgentCheckpoint>;
  resume(sessionId: AgentSessionId, options?: LifecycleCommandOptions): Promise<AgentSession>;
  pause(sessionId: AgentSessionId, reason: string, options?: LifecycleCommandOptions): Promise<void>;
  cancel(sessionId: AgentSessionId, reason: string, options?: LifecycleCommandOptions): Promise<void>;
}

export interface AgentSessionManagerOptions {
  taskRepository: TaskRepository;
  sessionRepository: AgentSessionRepository;
  checkpointStore: CheckpointStore;
  lifecyclePersistence: SessionLifecyclePersistence;
  dispatchClaims: DispatchClaimStore;
  workflowStatus: WorkflowStatusReader;
  clock: Clock;
  idFactory?: (attempt: number) => AgentSessionId;
  eventIdFactory?: () => ReturnType<typeof eventId>;
  hasPendingCleanup?: (sessionId: AgentSessionId) => boolean | Promise<boolean>;
}

const actor = { kind: 'SYSTEM' as const, name: 'agent-session-manager' };

export class AgentSessionManagerService implements AgentSessionManager {
  private nextSession = 0;
  private nextEvent = 0;

  public constructor(private readonly options: AgentSessionManagerOptions) {}

  public async start(input: StartSessionInput): Promise<AgentSession> {
    if (!input.idempotencyKey.trim()) throw new Error('A deterministic idempotency key is required');
    const task = await this.options.taskRepository.get(input.taskId);
    if (!task) throw new Error(`Task ${input.taskId} does not exist`);
    if (input.expectedTaskVersion !== undefined && task.version !== input.expectedTaskVersion) throw new OptimisticConcurrencyError(task.id, input.expectedTaskVersion, task.version);
    if (!await this.options.workflowStatus.isActive(task.workflowId)) throw new Error('Workflow is not active');
    const claim = await this.options.dispatchClaims.getDispatchClaim(task.id);
    if (!claim || claim.leaseId !== input.leaseId || claim.expiresAt.getTime() <= this.options.clock.now().getTime()) throw new Error('Current dispatch lease is missing, expired, or does not match');
    if (task.state !== 'READY') throw new InvalidTaskTransitionError(task.id, task.state, 'TASK_STARTED');
    const now = this.options.clock.now();
    const sessionId = input.idempotencyKey.startsWith('session:')
      ? agentSessionId(input.idempotencyKey.slice('session:'.length))
      : this.newSessionId(1);
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
    const command: OutboxCommand = {
      commandId: `start-agent-session:${input.idempotencyKey}:attempt:1`, type: 'START_AGENT_SESSION',
      actor, issuedAt: now, availableAt: now, correlationId: input.correlationId, causationId: transitioned.event.eventId,
      payload: { taskId: task.id, workflowId: task.workflowId, agentDefinitionId: input.agentDefinitionId,
        leaseId: input.leaseId, idempotencyKey: sessionId, attempt: 1, completedOperationKeys: [] }
    };
    const event = DomainEventSchema.parse({ eventId: transitioned.event.eventId, aggregateType: 'AGENT_SESSION',
      aggregateId: sessionId, aggregateVersion: 1, eventType: 'AGENT_SESSION_STARTED', actor,
      correlationId: input.correlationId, causationId: transitioned.event.causationId, occurredAt: now,
      payload: { sessionId, taskId: task.id } });
    await this.options.lifecyclePersistence.start({ task: transitioned.task, expectedTaskVersion: task.version, session,
      expectedSessionVersion: 0, event, command, idempotencyKey: input.idempotencyKey });
    return session;
  }

  public async checkpoint(input: SaveCheckpointInput): Promise<AgentCheckpoint> {
    const session = await this.requireSession(input.sessionId);
    if (input.expectedSessionVersion !== undefined && session.version !== input.expectedSessionVersion) throw new OptimisticConcurrencyError(session.sessionId, input.expectedSessionVersion, session.version);
    const latest = await this.options.checkpointStore.latest(input.sessionId);
    const current = latest?.sequence ?? 0;
    if (input.expectedSequence !== current) throw new Error(`Checkpoint sequence conflict: expected ${input.expectedSequence}, actual ${current}`);
    const checkpoint: AgentCheckpoint = {
      sessionId: session.sessionId, taskId: session.taskId, sequence: current + 1,
      state: input.state, contextReference: input.contextReference,
      lastEventId: input.lastEventId, completedOperationKeys: [...new Set(input.completedOperationKeys)],
      createdAt: this.options.clock.now()
    };
    const updated = { ...session, state: input.state, contextReference: input.contextReference,
      checkpointReference: `${session.sessionId}:checkpoint:${checkpoint.sequence}`,
      version: session.version + 1, updatedAt: checkpoint.createdAt };
    const event = DomainEventSchema.parse({ eventId: this.newEventId(), aggregateType: 'AGENT_SESSION',
      aggregateId: session.sessionId, aggregateVersion: updated.version, eventType: input.state === 'COMPLETED' ? 'AGENT_SESSION_COMPLETED' : 'AGENT_SESSION_PAUSED', actor,
      correlationId: session.traceId, causationId: input.lastEventId, occurredAt: checkpoint.createdAt,
      payload: { sessionId: session.sessionId, reason: 'checkpoint' } });
    await this.options.lifecyclePersistence.checkpoint({ checkpoint, session: updated, expectedSessionVersion: session.version,
      event, idempotencyKey: input.idempotencyKey ?? `checkpoint:${session.sessionId}:${checkpoint.sequence}` });
    return checkpoint;
  }

  public async resume(sessionId: AgentSessionId, options: LifecycleCommandOptions = {}): Promise<AgentSession> {
    const session = await this.requireSession(sessionId);
    if (session.state === 'RUNNING') return session;
    if (session.state === 'CANCELLED') throw new Error('A cancelled session cannot be resumed');
    if (session.state !== 'PAUSED' && session.state !== 'WAITING_FOR_TOOL') {
      throw new Error(`Session in ${session.state} cannot be resumed`);
    }
    if (options.expectedVersion !== undefined && session.version !== options.expectedVersion) throw new OptimisticConcurrencyError(session.sessionId, options.expectedVersion, session.version);
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
    const operationKey = options.idempotencyKey ?? `resume:${sessionId}:${attempt}`;
    const causationId = eventId(`resume-event:${operationKey}`);
    const command: OutboxCommand = { commandId: `start-agent-session:${sessionId}:attempt:${attempt}`, type: 'START_AGENT_SESSION',
      actor, issuedAt: now, availableAt: now, correlationId: session.traceId, causationId,
      payload: { taskId: session.taskId, workflowId: session.workflowId, agentDefinitionId: session.agentDefinitionId,
        leaseId: `resume:${sessionId}:${attempt}`, idempotencyKey: sessionId, attempt,
        completedOperationKeys: [...checkpoint.completedOperationKeys] } };
    const event = DomainEventSchema.parse({ eventId: causationId, aggregateType: 'AGENT_SESSION',
      aggregateId: sessionId, aggregateVersion: updated.version, eventType: 'AGENT_SESSION_RESUMED', actor,
      correlationId: session.traceId, causationId: checkpoint.lastEventId, occurredAt: now,
      payload: { sessionId } });
    try {
    await this.options.lifecyclePersistence.transition({ session: updated, expectedSessionVersion: session.version, event, command, expectedTaskVersion: null,
        idempotencyKey: operationKey });
    } catch (error) {
      if (!(error instanceof OptimisticConcurrencyError)) throw error;
      const current = await this.requireSession(sessionId);
      if (current.state === 'RUNNING') return current;
      throw error;
    }
    return updated;
  }

  public async pause(sessionId: AgentSessionId, reason: string, options: LifecycleCommandOptions = {}): Promise<void> {
    if (!reason.trim()) throw new Error('Pause reason is required');
    const session = await this.requireSession(sessionId);
    if (options.expectedVersion !== undefined && options.expectedVersion !== session.version && session.state !== 'PAUSED') throw new OptimisticConcurrencyError(sessionId, options.expectedVersion, session.version);
    if (session.state === 'PAUSED') return;
    if (!['RUNNING', 'WAITING_FOR_TOOL'].includes(session.state)) throw new Error(`Session in ${session.state} cannot be paused`);
    const now = this.options.clock.now();
    const updated = AgentSessionSchema.parse({ ...session, state: 'PAUSED', version: session.version + 1, updatedAt: now });
    const latest = await this.options.checkpointStore.latest(sessionId);
    const event = DomainEventSchema.parse({ eventId: this.newEventId(), aggregateType: 'AGENT_SESSION',
      aggregateId: sessionId, aggregateVersion: updated.version, eventType: 'AGENT_SESSION_PAUSED', actor,
      correlationId: session.traceId, causationId: latest?.lastEventId ?? this.newEventId(), occurredAt: now,
      payload: { sessionId, reason } });
    await this.options.lifecyclePersistence.transition({ session: updated, expectedSessionVersion: session.version, event, command: null, expectedTaskVersion: null,
      idempotencyKey: options.idempotencyKey ?? `pause:${sessionId}:${session.version}` });
  }

  public async cancel(sessionId: AgentSessionId, reason: string, options: LifecycleCommandOptions = {}): Promise<void> {
    if (!reason.trim()) throw new Error('Cancellation reason is required');
    const session = await this.requireSession(sessionId);
    if (options.expectedVersion !== undefined && options.expectedVersion !== session.version && session.state !== 'CANCELLED') throw new OptimisticConcurrencyError(sessionId, options.expectedVersion, session.version);
    if (session.state === 'CANCELLED') return;
    if (await this.options.hasPendingCleanup?.(sessionId)) throw new Error('Session cancellation is blocked while dependent cleanup is pending');
    const task = await this.options.taskRepository.get(session.taskId);
    if (!task) throw new Error(`Task ${session.taskId} does not exist`);
    if (task.state === 'CANCELLED') throw new Error('Task is already cancelled by another lifecycle operation');
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
      session: cancelledSession, expectedSessionVersion: session.version, event, idempotencyKey: options.idempotencyKey ?? `cancel:${sessionId}:${session.version}` });
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
