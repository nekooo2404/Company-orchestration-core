import { type AgentSession, type AgentSessionId, type DomainEvent, type OutboxCommand, type Task } from '@aicompany/contracts';
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
export declare class InMemoryAgentSessionRepository implements SnapshotAgentSessionRepository {
    private readonly sessions;
    private readonly idempotencyKeys;
    private readonly startFingerprints;
    private readonly requestFingerprints;
    get(sessionId: AgentSessionId): Promise<AgentSession | null>;
    snapshot(sessionId: AgentSessionId): AgentSession | null;
    findByTask(taskId: Task['id'], idempotencyKey: string): Promise<AgentSession | null>;
    save(input: AgentSession, expectedVersion: number): Promise<void>;
    bindIdempotency(taskId: Task['id'], key: string, sessionId: AgentSessionId): void;
    startFingerprint(taskId: Task['id'], key: string): string | null;
    bindStartFingerprint(taskId: Task['id'], key: string, fingerprint: string): void;
    restoreStartFingerprint(taskId: Task['id'], key: string, value: string | null): void;
    snapshotRequestFingerprint(key: string): string | null;
    restoreRequestFingerprint(key: string, value: string | null): void;
    unbindIdempotency(taskId: Task['id'], key: string): void;
    snapshotIdempotency(taskId: Task['id'], key: string): AgentSessionId | null;
    restoreIdempotency(taskId: Task['id'], key: string, value: AgentSessionId | null): void;
    restore(sessionId: AgentSessionId, session: AgentSession | null): void;
}
export interface WorkflowStatusReader {
    isActive(workflowId: AgentSession['workflowId']): Promise<boolean>;
}
export interface SessionLifecyclePersistence {
    start(input: {
        task: Task;
        expectedTaskVersion: number;
        session: AgentSession;
        expectedSessionVersion: 0;
        taskEvent: DomainEvent;
        event: DomainEvent;
        command: OutboxCommand;
        idempotencyKey: string;
        requestFingerprint: string;
    }): Promise<void>;
    checkpoint(input: {
        checkpoint: AgentCheckpoint;
        session: AgentSession;
        expectedSessionVersion: number;
        event: DomainEvent;
        idempotencyKey: string;
        requestFingerprint: string;
    }): Promise<void>;
    transition(input: {
        session: AgentSession;
        expectedSessionVersion: number;
        event: DomainEvent;
        command: OutboxCommand | null;
        expectedTaskVersion: number | null;
        idempotencyKey: string;
        requestFingerprint: string;
    }): Promise<void>;
    cancel(input: {
        task: Task;
        expectedTaskVersion: number;
        session: AgentSession;
        expectedSessionVersion: number;
        taskEvent: DomainEvent;
        event: DomainEvent;
        idempotencyKey: string;
        requestFingerprint: string;
    }): Promise<void>;
    operationFingerprint(idempotencyKey: string): string | null;
    requestFingerprint(idempotencyKey: string): string | null;
    operationResult(idempotencyKey: string): {
        sessionId: AgentSessionId;
        version: number;
        attempt: number;
    } | null;
    operationCheckpoint(idempotencyKey: string): AgentCheckpoint | null;
}
export type LifecycleWritePoint = 'task' | 'session' | 'checkpoint' | 'event' | 'command';
export interface InMemoryLifecycleOptions {
    failAt?: (point: LifecycleWritePoint) => void;
}
export declare class InMemorySessionLifecyclePersistence implements SessionLifecyclePersistence, CheckpointStore {
    private readonly tasks;
    private readonly sessions;
    private readonly options;
    private readonly operations;
    private readonly operationResults;
    private readonly operationCheckpoints;
    private readonly checkpoints;
    private readonly events;
    private readonly commands;
    private transactionTail;
    constructor(tasks: InMemoryTaskRepository, sessions: SnapshotAgentSessionRepository, options?: InMemoryLifecycleOptions);
    start(input: Parameters<SessionLifecyclePersistence['start']>[0]): Promise<void>;
    checkpoint(input: Parameters<SessionLifecyclePersistence['checkpoint']>[0]): Promise<void>;
    transition(input: Parameters<SessionLifecyclePersistence['transition']>[0]): Promise<void>;
    cancel(input: Parameters<SessionLifecyclePersistence['cancel']>[0]): Promise<void>;
    listEvents(): DomainEvent[];
    operationFingerprint(idempotencyKey: string): string | null;
    requestFingerprint(idempotencyKey: string): string | null;
    operationResult(idempotencyKey: string): {
        sessionId: AgentSessionId;
        version: number;
        attempt: number;
    } | null;
    operationCheckpoint(idempotencyKey: string): AgentCheckpoint | null;
    listCommands(): OutboxCommand[];
    latestCheckpoint(sessionId: AgentSessionId): Promise<AgentCheckpoint | null>;
    latest(sessionId: AgentSessionId): Promise<AgentCheckpoint | null>;
    save(): Promise<void>;
    private fingerprint;
    private isDuplicate;
    private recordFingerprint;
    private append;
    private pendingFingerprint;
    private pendingKey;
    private assertVersion;
    private serialize;
    private atomic;
}
export declare const canonicalFingerprint: (value: unknown) => string;
//# sourceMappingURL=session-commands.d.ts.map