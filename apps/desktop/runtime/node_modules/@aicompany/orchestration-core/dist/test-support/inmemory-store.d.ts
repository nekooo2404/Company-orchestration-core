import { type DomainEvent, type EventId, type Task, type TaskId, type WorkflowId } from '@aicompany/contracts';
import { DuplicatePersistenceIdError, InvalidPersistenceOperationError, OptimisticConcurrencyError } from '../repository.js';
import type { DispatchClaim, DispatchClaimRequest, DispatchClaimStore, EventStore, Outbox, OutboxCommand, SaveApprovalDecisionAndTaskInput, SaveApprovalRequestInput, SaveTaskAndAppendInput, TaskRepository, TransactionalPersistence } from '../ports.js';
import type { InMemoryApprovalStore } from '../approvals.js';
import type { InMemoryRecoveryRecordStore } from '../recovery.js';
export declare class InMemoryEventStore implements EventStore {
    private readonly streams;
    private readonly eventsById;
    append(events: readonly DomainEvent[], expectedVersion: number): Promise<void>;
    appendApprovalRequest(event: DomainEvent): Promise<void>;
    readStream(aggregateId: string, afterVersion?: number): Promise<DomainEvent[]>;
    hasEvent(eventId: EventId): Promise<boolean>;
    snapshot(): {
        streams: Array<[string, DomainEvent[]]>;
        eventsById: Array<[string, DomainEvent]>;
    };
    restore(snapshot: {
        streams: Array<[string, DomainEvent[]]>;
        eventsById: Array<[string, DomainEvent]>;
    }): void;
}
export declare class InMemoryDispatchClaimStore implements DispatchClaimStore {
    private readonly tasks?;
    private readonly claims;
    private transactionTail;
    constructor(tasks?: TaskRepository | undefined);
    claimDispatch(input: DispatchClaimRequest): Promise<DispatchClaim | null>;
    beginDispatchCleanup(taskId: TaskId, workerId: string, leaseId: string, generation: number): Promise<boolean>;
    abortDispatchCleanup(taskId: TaskId, workerId: string, leaseId: string, generation: number): Promise<void>;
    retire(taskId: TaskId): void;
    snapshot(): Map<string, DispatchClaim>;
    restore(snapshot: Map<string, DispatchClaim>): void;
    getDispatchClaim(taskId: TaskId): Promise<DispatchClaim | null>;
    releaseDispatch(taskId: TaskId, workerId: string, leaseId: string): Promise<boolean>;
    private serialize;
}
export declare class InMemoryTransactionalPersistence implements TransactionalPersistence {
    private readonly persistence;
    private readonly claims;
    constructor(persistence: Pick<TransactionalPersistence, 'saveTaskAndAppend'>, claims: DispatchClaimStore);
    saveTaskAndAppend(input: SaveTaskAndAppendInput): Promise<void>;
    saveRecoveryAndAppend(input: SaveTaskAndAppendInput & {
        record: import('../recovery').RecoveryRecord;
        idempotencyKey: string;
        requestFingerprint: string;
    }): Promise<void>;
    saveApprovalDecisionAndTask(input: SaveApprovalDecisionAndTaskInput): Promise<void>;
    saveApprovalRequest(input: SaveApprovalRequestInput): Promise<import('@aicompany/contracts').ApprovalRecord>;
    claimDispatch(input: DispatchClaimRequest): Promise<DispatchClaim | null>;
    getDispatchClaim(taskId: TaskId): Promise<DispatchClaim | null>;
    beginDispatchCleanup(taskId: TaskId, workerId: string, leaseId: string, generation: number): Promise<boolean>;
    abortDispatchCleanup(taskId: TaskId, workerId: string, leaseId: string, generation: number): Promise<void>;
    releaseDispatch(taskId: TaskId, workerId: string, leaseId: string): Promise<boolean>;
}
export declare class InMemoryTaskRepository implements TaskRepository {
    private readonly tasks;
    get(taskId: TaskId): Promise<Task | null>;
    listByWorkflow(workflowId: WorkflowId): Promise<Task[]>;
    countActiveByAgent(agentId: NonNullable<Task['ownerAgentDefinitionId']>): Promise<number>;
    save(task: Task, expectedVersion: number): Promise<void>;
    snapshot(taskId: TaskId): Task | null;
    restore(taskId: TaskId, task: Task | null): void;
}
export interface InMemoryOutboxOptions {
    now?: () => Date;
    leaseDurationMs?: number;
}
export declare class InMemoryOutbox implements Outbox {
    private readonly commands;
    private readonly now;
    private readonly leaseDurationMs;
    constructor(options?: InMemoryOutboxOptions);
    enqueue(command: OutboxCommand): Promise<void>;
    claim(limit: number, workerId: string): Promise<OutboxCommand[]>;
    markCompleted(commandId: string): Promise<void>;
    snapshot(): Map<string, OutboxCommand>;
    restore(snapshot: Map<string, OutboxCommand>): void;
    retireStartsForTask(taskId: TaskId): void;
}
export type InMemoryApprovalFailurePoint = 'after-request-approval' | 'after-request-event' | 'after-request-outbox' | 'after-approval' | 'after-task' | 'after-approval-event' | 'after-task-event' | 'after-outbox' | 'after-recovery-task' | 'after-recovery-record';
export interface InMemoryApprovalTransactionalPersistenceOptions {
    tasks: InMemoryTaskRepository;
    events: InMemoryEventStore;
    outbox: InMemoryOutbox;
    approvals: InMemoryApprovalStore;
    records?: InMemoryRecoveryRecordStore;
    claims?: InMemoryDispatchClaimStore;
    failAfter?: InMemoryApprovalFailurePoint;
}
export declare class InMemoryApprovalTransactionalPersistence implements TransactionalPersistence {
    private readonly options;
    private readonly claims;
    private readonly operations;
    private transactionTail;
    constructor(options: InMemoryApprovalTransactionalPersistenceOptions);
    saveTaskAndAppend(input: SaveTaskAndAppendInput): Promise<void>;
    saveRecoveryAndAppend(input: SaveTaskAndAppendInput & {
        record: import('../recovery').RecoveryRecord;
        idempotencyKey: string;
        requestFingerprint: string;
    }): Promise<void>;
    private atomicTask;
    private writeTask;
    private serialize;
    saveApprovalRequest(input: SaveApprovalRequestInput): Promise<import('@aicompany/contracts').ApprovalRecord>;
    saveApprovalDecisionAndTask(input: SaveApprovalDecisionAndTaskInput): Promise<void>;
    claimDispatch(input: DispatchClaimRequest): Promise<DispatchClaim | null>;
    getDispatchClaim(taskId: TaskId): Promise<DispatchClaim | null>;
    beginDispatchCleanup(taskId: TaskId, workerId: string, leaseId: string, generation: number): Promise<boolean>;
    abortDispatchCleanup(taskId: TaskId, workerId: string, leaseId: string, generation: number): Promise<void>;
    releaseDispatch(taskId: TaskId, workerId: string, leaseId: string): Promise<boolean>;
    private failIf;
}
export { DuplicatePersistenceIdError, InvalidPersistenceOperationError, OptimisticConcurrencyError };
//# sourceMappingURL=inmemory-store.d.ts.map