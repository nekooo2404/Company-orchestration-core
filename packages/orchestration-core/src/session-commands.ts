import {
  AgentSessionSchema,
  DomainEventSchema,
  type AgentSession,
  type AgentSessionId,
  type DomainEvent,
  type OutboxCommand,
  type Task
} from '@aicompany/contracts';
import { OptimisticConcurrencyError } from './repository';
import type { AgentCheckpoint } from './checkpoints';
import type { InMemoryTaskRepository } from './test-support/inmemory-store';
import type { CheckpointStore } from './checkpoints';

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

  public snapshot(sessionId: AgentSessionId): AgentSession | null { return this.sessions.get(sessionId) ? globalThis.structuredClone(this.sessions.get(sessionId)!) : null; }
  public restore(sessionId: AgentSessionId, session: AgentSession | null): void {
    if (session) this.sessions.set(sessionId, globalThis.structuredClone(session));
    else this.sessions.delete(sessionId);
  }
}

export interface WorkflowStatusReader {
  isActive(workflowId: AgentSession['workflowId']): Promise<boolean>;
}

export interface SessionLifecyclePersistence {
  start(input: { task: Task; expectedTaskVersion: number; session: AgentSession; expectedSessionVersion: 0; event: DomainEvent; command: OutboxCommand; idempotencyKey: string }): Promise<void>;
  checkpoint(input: { checkpoint: AgentCheckpoint; session: AgentSession; expectedSessionVersion: number; event: DomainEvent; idempotencyKey: string }): Promise<void>;
  transition(input: { session: AgentSession; expectedSessionVersion: number; event: DomainEvent; command: OutboxCommand | null; expectedTaskVersion: number | null; idempotencyKey: string }): Promise<void>;
  cancel(input: { task: Task; expectedTaskVersion: number; session: AgentSession; expectedSessionVersion: number; event: DomainEvent; idempotencyKey: string }): Promise<void>;
}

export class InMemorySessionLifecyclePersistence implements SessionLifecyclePersistence, CheckpointStore {
  private readonly operations = new Map<string, string>();
  private readonly checkpoints = new Map<AgentSessionId, AgentCheckpoint>();
  private readonly events: DomainEvent[] = [];
  private readonly commands: OutboxCommand[] = [];
  private transactionTail: Promise<void> = Promise.resolve();

  public constructor(private readonly tasks: InMemoryTaskRepository, private readonly sessions: AgentSessionRepository) {}

  public async start(input: Parameters<SessionLifecyclePersistence['start']>[0]): Promise<void> {
    return this.serialize(async () => {
    if (this.isDuplicate(input.idempotencyKey, input)) return;
    const current = await this.tasks.get(input.task.id);
    this.assertVersion(input.task.id, input.expectedTaskVersion, current?.version ?? 0);
    if (await this.sessions.get(input.session.sessionId)) throw new Error('Session already exists');
    DomainEventSchema.parse(input.event);
    this.recordFingerprint(input.idempotencyKey, input);
    await this.tasks.save(input.task, input.expectedTaskVersion);
    await this.sessions.save(input.session, input.expectedSessionVersion);
    this.append(input.event, input.command, input.idempotencyKey);
    });
  }

  public async checkpoint(input: Parameters<SessionLifecyclePersistence['checkpoint']>[0]): Promise<void> {
    return this.serialize(async () => {
    if (this.isDuplicate(input.idempotencyKey, input)) return;
    const current = await this.sessions.get(input.session.sessionId);
    this.assertVersion(input.session.sessionId, input.expectedSessionVersion, current?.version ?? 0);
    const previous = this.checkpoints.get(input.checkpoint.sessionId);
    const expectedSequence = (previous?.sequence ?? 0) + 1;
    if (input.checkpoint.sequence !== expectedSequence) throw new Error(`Checkpoint sequence must be ${expectedSequence}`);
    DomainEventSchema.parse(input.event);
    this.recordFingerprint(input.idempotencyKey, input);
    await this.sessions.save(input.session, input.expectedSessionVersion);
    this.checkpoints.set(input.checkpoint.sessionId, globalThis.structuredClone(input.checkpoint));
    this.append(input.event, null, input.idempotencyKey);
    });
  }

  public async transition(input: Parameters<SessionLifecyclePersistence['transition']>[0]): Promise<void> {
    return this.serialize(async () => {
    if (this.isDuplicate(input.idempotencyKey, input)) return;
    const current = await this.sessions.get(input.session.sessionId);
    this.assertVersion(input.session.sessionId, input.expectedSessionVersion, current?.version ?? 0);
    if (input.expectedTaskVersion !== null) {
      const task = await this.tasks.get(input.session.taskId);
      this.assertVersion(input.session.taskId, input.expectedTaskVersion, task?.version ?? 0);
    }
    DomainEventSchema.parse(input.event);
    this.recordFingerprint(input.idempotencyKey, input);
    await this.sessions.save(input.session, input.expectedSessionVersion);
    this.append(input.event, input.command, input.idempotencyKey);
    });
  }

  public async cancel(input: Parameters<SessionLifecyclePersistence['cancel']>[0]): Promise<void> {
    return this.serialize(async () => {
    if (this.isDuplicate(input.idempotencyKey, input)) return;
    const currentTask = await this.tasks.get(input.task.id);
    const currentSession = await this.sessions.get(input.session.sessionId);
    this.assertVersion(input.task.id, input.expectedTaskVersion, currentTask?.version ?? 0);
    this.assertVersion(input.session.sessionId, input.expectedSessionVersion, currentSession?.version ?? 0);
    DomainEventSchema.parse(input.event);
    this.recordFingerprint(input.idempotencyKey, input);
    await this.tasks.save(input.task, input.expectedTaskVersion);
    await this.sessions.save(input.session, input.expectedSessionVersion);
    this.append(input.event, null, input.idempotencyKey);
    });
  }

  public listEvents(): DomainEvent[] { return globalThis.structuredClone(this.events); }
  public listCommands(): OutboxCommand[] { return globalThis.structuredClone(this.commands); }
  public async latestCheckpoint(sessionId: AgentSessionId): Promise<AgentCheckpoint | null> {
    const checkpoint = this.checkpoints.get(sessionId);
    return checkpoint ? globalThis.structuredClone(checkpoint) : null;
  }
  public async latest(sessionId: AgentSessionId): Promise<AgentCheckpoint | null> { return this.latestCheckpoint(sessionId); }
  public async save(): Promise<void> { throw new Error('Checkpoint writes must use lifecyclePersistence.checkpoint'); }

  private fingerprint(input: unknown): string {
    const operation = input as { session?: AgentSession; task?: Task; checkpoint?: AgentCheckpoint; event?: DomainEvent; command?: OutboxCommand | null };
    return JSON.stringify({
      taskId: operation.task?.id,
      taskVersion: operation.task?.version,
      sessionId: operation.session?.sessionId,
      sessionVersion: operation.session?.version,
      checkpointSequence: operation.checkpoint?.sequence,
      eventId: operation.event?.eventId,
      commandId: operation.command?.commandId,
      commandPayload: operation.command?.payload
    });
  }

  private isDuplicate(key: string, input: unknown): boolean {
    const fingerprint = this.fingerprint(input);
    const prior = this.operations.get(key);
    if (prior !== undefined) {
      if (prior !== fingerprint) throw new Error(`Idempotency key ${key} was reused with different input`);
      return true;
    }
    return false;
  }

  private recordFingerprint(key: string, input: unknown): void { this.pendingFingerprint = this.fingerprint(input); this.pendingKey = key; }

  private append(event: DomainEvent, command: OutboxCommand | null, key: string): void {
    DomainEventSchema.parse(event);
    this.events.push(globalThis.structuredClone(event));
    if (command) this.commands.push(globalThis.structuredClone(command));
    if (this.pendingKey === key) this.operations.set(key, this.pendingFingerprint);
  }

  private pendingFingerprint = '';
  private pendingKey = '';

  private assertVersion(id: string, expected: number, actual: number): void {
    if (expected !== actual) throw new OptimisticConcurrencyError(id, expected, actual);
  }

  private async serialize<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.transactionTail;
    let release!: () => void;
    this.transactionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }

}
