import {
  AgentSessionSchema,
  DomainEventSchema,
  type AgentSession,
  type AgentSessionId,
  type DomainEvent,
  type OutboxCommand,
  type Task
} from '@aicompany/contracts';
import { OptimisticConcurrencyError } from './repository.js';
import type { AgentCheckpoint } from './checkpoints.js';
import type { InMemoryTaskRepository } from './test-support/inmemory-store.js';
import type { CheckpointStore } from './checkpoints.js';

export interface AgentSessionRepository {
  get(sessionId: AgentSessionId): Promise<AgentSession | null>;
  findByTask(taskId: Task['id'], idempotencyKey: string): Promise<AgentSession | null>;
  startFingerprint(taskId: Task['id'], idempotencyKey: string): string | null | Promise<string | null>;
  save(session: AgentSession, expectedVersion: number): Promise<void>;
}

export interface SnapshotAgentSessionRepository extends AgentSessionRepository {
  startFingerprint(taskId: Task['id'], idempotencyKey: string): string | null;
  snapshot(sessionId: AgentSessionId): AgentSession | null;
  restore(sessionId: AgentSessionId, session: AgentSession | null): void;
  bindIdempotency(taskId: Task['id'], key: string, sessionId: AgentSessionId): void;
  unbindIdempotency(taskId: Task['id'], key: string): void;
  snapshotIdempotency(taskId: Task['id'], key: string): AgentSessionId | null;
  restoreIdempotency(taskId: Task['id'], key: string, value: AgentSessionId | null): void;
  bindStartFingerprint(taskId: Task['id'], key: string, fingerprint: string): void;
  restoreStartFingerprint(taskId: Task['id'], key: string, value: string | null): void;
  snapshotRequestFingerprint(key: string): string | null;
  restoreRequestFingerprint(key: string, value: string | null): void;
}

export class InMemoryAgentSessionRepository implements SnapshotAgentSessionRepository {
  private readonly sessions = new Map<AgentSessionId, AgentSession>();
  private readonly idempotencyKeys = new Map<string, AgentSessionId>();
  private readonly startFingerprints = new Map<string, string>();
  private readonly requestFingerprints = new Map<string, string>();

  public async get(sessionId: AgentSessionId): Promise<AgentSession | null> {
    const session = this.sessions.get(sessionId);
    return session ? globalThis.structuredClone(session) : null;
  }

  public snapshot(sessionId: AgentSessionId): AgentSession | null {
    const session = this.sessions.get(sessionId);
    return session ? globalThis.structuredClone(session) : null;
  }

  public async findByTask(taskId: Task['id'], idempotencyKey: string): Promise<AgentSession | null> {
    const sessionId = this.idempotencyKeys.get(`${taskId}:${idempotencyKey}`);
    const session = sessionId ? this.sessions.get(sessionId) : null;
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

  public bindIdempotency(taskId: Task['id'], key: string, sessionId: AgentSessionId): void { this.idempotencyKeys.set(`${taskId}:${key}`, sessionId); }
  public startFingerprint(taskId: Task['id'], key: string): string | null { return this.startFingerprints.get(`${taskId}:${key}`) ?? null; }
  public bindStartFingerprint(taskId: Task['id'], key: string, fingerprint: string): void { this.startFingerprints.set(`${taskId}:${key}`, fingerprint); }
  public restoreStartFingerprint(taskId: Task['id'], key: string, value: string | null): void { if (value) this.startFingerprints.set(`${taskId}:${key}`, value); else this.startFingerprints.delete(`${taskId}:${key}`); }
  public snapshotRequestFingerprint(key: string): string | null { return this.requestFingerprints.get(key) ?? null; }
  public restoreRequestFingerprint(key: string, value: string | null): void { if (value) this.requestFingerprints.set(key, value); else this.requestFingerprints.delete(key); }
  public unbindIdempotency(taskId: Task['id'], key: string): void { this.idempotencyKeys.delete(`${taskId}:${key}`); }
  public snapshotIdempotency(taskId: Task['id'], key: string): AgentSessionId | null { return this.idempotencyKeys.get(`${taskId}:${key}`) ?? null; }
  public restoreIdempotency(taskId: Task['id'], key: string, value: AgentSessionId | null): void {
    if (value) this.idempotencyKeys.set(`${taskId}:${key}`, value); else this.idempotencyKeys.delete(`${taskId}:${key}`);
  }
  public restore(sessionId: AgentSessionId, session: AgentSession | null): void {
    if (session) this.sessions.set(sessionId, globalThis.structuredClone(session));
    else this.sessions.delete(sessionId);
  }
}

export interface WorkflowStatusReader {
  isActive(workflowId: AgentSession['workflowId']): Promise<boolean>;
}

export interface SessionLifecyclePersistence {
  start(input: { task: Task; expectedTaskVersion: number; session: AgentSession; expectedSessionVersion: 0; taskEvent: DomainEvent; event: DomainEvent; command: OutboxCommand; idempotencyKey: string; requestFingerprint: string }): Promise<void>;
  checkpoint(input: { checkpoint: AgentCheckpoint; session: AgentSession; expectedSessionVersion: number; event: DomainEvent; idempotencyKey: string; requestFingerprint: string }): Promise<void>;
  transition(input: { session: AgentSession; expectedSessionVersion: number; event: DomainEvent; command: OutboxCommand | null; expectedTaskVersion: number | null; idempotencyKey: string; requestFingerprint: string }): Promise<void>;
  cancel(input: { task: Task; expectedTaskVersion: number; session: AgentSession; expectedSessionVersion: number; taskEvent: DomainEvent; event: DomainEvent; idempotencyKey: string; requestFingerprint: string }): Promise<void>;
  operationFingerprint(idempotencyKey: string): string | null;
  requestFingerprint(idempotencyKey: string): string | null;
  operationResult(idempotencyKey: string): { sessionId: AgentSessionId; version: number; attempt: number } | null;
  operationCheckpoint(idempotencyKey: string): AgentCheckpoint | null;
}

export type LifecycleWritePoint = 'task' | 'session' | 'checkpoint' | 'event' | 'command';
export interface InMemoryLifecycleOptions { failAt?: (point: LifecycleWritePoint) => void }

export class InMemorySessionLifecyclePersistence implements SessionLifecyclePersistence, CheckpointStore {
  private readonly operations = new Map<string, string>();
  private readonly operationResults = new Map<string, { sessionId: AgentSessionId; version: number; attempt: number }>();
  private readonly operationCheckpoints = new Map<string, AgentCheckpoint>();
  private readonly checkpoints = new Map<AgentSessionId, AgentCheckpoint>();
  private readonly events: DomainEvent[] = [];
  private readonly commands: OutboxCommand[] = [];
  private transactionTail: Promise<void> = Promise.resolve();

  public constructor(private readonly tasks: InMemoryTaskRepository, private readonly sessions: SnapshotAgentSessionRepository, private readonly options: InMemoryLifecycleOptions = {}) {}

  public async start(input: Parameters<SessionLifecyclePersistence['start']>[0]): Promise<void> {
    return this.serialize(async () => {
    if (this.isDuplicate(input.idempotencyKey, input)) return;
    const current = await this.tasks.get(input.task.id);
    this.assertVersion(input.task.id, input.expectedTaskVersion, current?.version ?? 0);
    if (await this.sessions.get(input.session.sessionId)) throw new Error('Session already exists');
    DomainEventSchema.parse(input.event);
    this.recordFingerprint(input.idempotencyKey, input);
    await this.atomic(input.idempotencyKey, async () => {
      await this.tasks.save(input.task, input.expectedTaskVersion); this.options.failAt?.('task');
      await this.sessions.save(input.session, input.expectedSessionVersion); this.options.failAt?.('session');
      this.sessions.bindIdempotency(input.task.id, input.idempotencyKey, input.session.sessionId);
      if (input.command.type === 'START_AGENT_SESSION') this.sessions.bindStartFingerprint(input.task.id, input.idempotencyKey, JSON.stringify({
        taskId: input.task.id, leaseId: input.command.payload.leaseId,
        agentDefinitionId: input.command.payload.agentDefinitionId,
        correlationId: input.command.correlationId, expectedTaskVersion: input.expectedTaskVersion
      }));
      this.append(input.event, input.command, input.idempotencyKey, input, input.taskEvent); this.sessions.restoreRequestFingerprint(input.idempotencyKey, input.requestFingerprint); this.options.failAt?.('event'); if (input.command) this.options.failAt?.('command');
    }, input.task.id, input.session.sessionId);
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
    await this.atomic(input.idempotencyKey, async () => {
      await this.sessions.save(input.session, input.expectedSessionVersion); this.options.failAt?.('session');
      this.checkpoints.set(input.checkpoint.sessionId, globalThis.structuredClone(input.checkpoint)); this.options.failAt?.('checkpoint');
      this.append(input.event, null, input.idempotencyKey, input); this.operationCheckpoints.set(input.idempotencyKey, globalThis.structuredClone(input.checkpoint));
      this.sessions.restoreRequestFingerprint(input.idempotencyKey, input.requestFingerprint); this.options.failAt?.('event');
    }, null, input.session.sessionId);
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
    await this.atomic(input.idempotencyKey, async () => {
      await this.sessions.save(input.session, input.expectedSessionVersion); this.options.failAt?.('session');
      this.append(input.event, input.command, input.idempotencyKey, input); this.sessions.restoreRequestFingerprint(input.idempotencyKey, input.requestFingerprint); this.options.failAt?.('event'); if (input.command) this.options.failAt?.('command');
    }, null, input.session.sessionId);
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
    await this.atomic(input.idempotencyKey, async () => {
      await this.tasks.save(input.task, input.expectedTaskVersion); this.options.failAt?.('task');
      await this.sessions.save(input.session, input.expectedSessionVersion); this.options.failAt?.('session');
      this.append(input.event, null, input.idempotencyKey, input, input.taskEvent); this.sessions.restoreRequestFingerprint(input.idempotencyKey, input.requestFingerprint); this.options.failAt?.('event');
    }, input.task.id, input.session.sessionId);
    });
  }

  public listEvents(): DomainEvent[] { return globalThis.structuredClone(this.events); }
  public operationFingerprint(idempotencyKey: string): string | null { return this.operations.get(idempotencyKey) ?? null; }
  public requestFingerprint(idempotencyKey: string): string | null { return this.sessions.snapshotRequestFingerprint(idempotencyKey); }
  public operationResult(idempotencyKey: string): { sessionId: AgentSessionId; version: number; attempt: number } | null {
    const value = this.operationResults.get(idempotencyKey); return value ? { ...value } : null;
  }
  public operationCheckpoint(idempotencyKey: string): AgentCheckpoint | null {
    const checkpoint = this.operationCheckpoints.get(idempotencyKey); return checkpoint ? globalThis.structuredClone(checkpoint) : null;
  }
  public listCommands(): OutboxCommand[] { return globalThis.structuredClone(this.commands); }
  public async latestCheckpoint(sessionId: AgentSessionId): Promise<AgentCheckpoint | null> {
    const checkpoint = this.checkpoints.get(sessionId);
    return checkpoint ? globalThis.structuredClone(checkpoint) : null;
  }
  public async latest(sessionId: AgentSessionId): Promise<AgentCheckpoint | null> { return this.latestCheckpoint(sessionId); }
  public async save(): Promise<void> { throw new Error('Checkpoint writes must use lifecyclePersistence.checkpoint'); }

  private fingerprint(input: unknown): string { return canonicalFingerprint(input); }

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

  private append(event: DomainEvent, command: OutboxCommand | null, key: string, input: unknown, taskEvent?: DomainEvent): void {
    DomainEventSchema.parse(event);
    if (taskEvent) {
      DomainEventSchema.parse(taskEvent);
      if (taskEvent.eventId === event.eventId) throw new Error('Task and session event IDs must differ');
      this.events.push(globalThis.structuredClone(taskEvent));
    }
    this.events.push(globalThis.structuredClone(event));
    if (command) this.commands.push(globalThis.structuredClone(command));
    if (this.pendingKey === key) this.operations.set(key, this.fingerprint(input));
    const session = (input as { session?: AgentSession }).session;
    if (session) this.operationResults.set(key, { sessionId: session.sessionId, version: session.version, attempt: session.attempt ?? 1 });
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

  private async atomic(key: string, operation: () => Promise<void>, taskId: Task['id'] | null, sessionId: AgentSessionId): Promise<void> {
    const oldTask = taskId ? this.tasks.snapshot(taskId) : null;
    const oldSession = this.sessions.snapshot(sessionId);
    const oldIdempotency = taskId ? this.sessions.snapshotIdempotency(taskId, key) : null;
    const oldStartFingerprint = taskId ? this.sessions.startFingerprint(taskId, key) : null;
    const oldRequestFingerprint = this.sessions.snapshotRequestFingerprint(key);
    const oldCheckpoint = this.checkpoints.get(sessionId);
    const eventLength = this.events.length; const commandLength = this.commands.length;
    const oldFingerprint = this.operations.get(key);
    const oldResult = this.operationResults.get(key);
    const oldOperationCheckpoint = this.operationCheckpoints.get(key);
    try { await operation(); }
    catch (error) {
      if (taskId) this.tasks.restore(taskId, oldTask);
      this.sessions.restore(sessionId, oldSession);
      if (taskId) this.sessions.restoreIdempotency(taskId, key, oldIdempotency);
      if (taskId) this.sessions.restoreStartFingerprint(taskId, key, oldStartFingerprint);
      this.sessions.restoreRequestFingerprint(key, oldRequestFingerprint);
      this.checkpoints.delete(sessionId); if (oldCheckpoint) this.checkpoints.set(sessionId, oldCheckpoint);
      this.events.length = eventLength; this.commands.length = commandLength;
      if (oldFingerprint === undefined) this.operations.delete(key); else this.operations.set(key, oldFingerprint);
      if (oldResult === undefined) this.operationResults.delete(key); else this.operationResults.set(key, oldResult);
      if (oldOperationCheckpoint === undefined) this.operationCheckpoints.delete(key); else this.operationCheckpoints.set(key, oldOperationCheckpoint);
      throw error;
    }
  }

}

export const canonicalFingerprint = (value: unknown): string => {
  const normalize = (entry: unknown): unknown => {
    if (entry instanceof Date) return entry.toISOString();
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry !== null && typeof entry === 'object') return Object.fromEntries(
      Object.entries(entry as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)])
    );
    return entry;
  };
  return JSON.stringify(normalize(value));
};
