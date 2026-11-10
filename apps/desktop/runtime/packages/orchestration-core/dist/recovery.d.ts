import { type ActorRef, type ApprovalRecord, type CorrelationId, type DomainEvent, type TaskId } from '@aicompany/contracts';
import type { TransactionalPersistence } from './ports.js';
import type { TaskRepository } from './repository.js';
export interface FailureContext {
    taskId: TaskId;
    attemptId: string;
    errorClass: string;
    commandName: string;
    exitCode?: number;
    message: string;
    evidenceIds: string[];
}
export interface RecoveryPlan {
    strategyName: string;
    changedAssumption: string;
    action: 'RETRY' | 'ALTERNATE_AGENT' | 'DEPENDENCY_REPAIR' | 'ROLLBACK' | 'REPLAN';
}
export interface RecoveryRequest {
    taskId: TaskId;
    failure: FailureContext;
    actor: ActorRef;
    correlationId: CorrelationId;
    fingerprintOverride?: string;
}
export interface RecoveryRecord {
    recoveryId: string;
    taskId: TaskId;
    cycle: number;
    fingerprint: string;
    plan: RecoveryPlan;
    state: 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'ESCALATED';
    createdAt: Date;
    evidenceIds: string[];
    startFingerprint?: string;
    completionFingerprint?: string;
}
export interface RecoveryCompletion {
    recoveryId: string;
    taskId: TaskId;
    succeeded: boolean;
    evidenceIds: string[];
}
export interface EscalationRequest {
    taskId: TaskId;
    reason: string;
    recoveryId: string;
    actor: ActorRef;
    correlationId: CorrelationId;
    evidenceIds?: string[];
}
export interface RecoveryCoordinator {
    start(input: RecoveryRequest): Promise<RecoveryRecord>;
    complete(input: RecoveryCompletion): Promise<void>;
    escalate(input: EscalationRequest): Promise<ApprovalRecord>;
}
export interface RecoveryEventConsumer {
    handleTaskEvent(event: DomainEvent, failure?: FailureContext): Promise<RecoveryRecord | null>;
}
export interface RecoveryStrategy {
    name: string;
    canHandle(failure: FailureContext): boolean;
    plan(failure: FailureContext): RecoveryPlan;
}
export interface RecoveryRecordStore {
    get(recoveryId: string): Promise<RecoveryRecord | null>;
    list(taskId: TaskId): Promise<RecoveryRecord[]>;
    save(record: RecoveryRecord): Promise<void>;
}
export declare class InMemoryRecoveryRecordStore implements RecoveryRecordStore {
    private readonly records;
    get(recoveryId: string): Promise<RecoveryRecord | null>;
    list(taskId: TaskId): Promise<RecoveryRecord[]>;
    save(record: RecoveryRecord): Promise<void>;
    snapshot(): Map<string, RecoveryRecord>;
    restore(snapshot: Map<string, RecoveryRecord>): void;
}
export interface RecoveryCoordinatorOptions {
    taskRepository: TaskRepository;
    transactionalPersistence: TransactionalPersistence;
    records: RecoveryRecordStore;
    strategies: readonly RecoveryStrategy[];
    now?: () => Date;
    newRecoveryId?: (cycle: number, taskId: TaskId) => string;
    newApprovalId?: (cycle: number, taskId: TaskId) => string;
}
export declare class RecoveryCoordinatorService implements RecoveryCoordinator, RecoveryEventConsumer {
    private readonly options;
    private readonly now;
    constructor(options: RecoveryCoordinatorOptions);
    handleTaskEvent(event: DomainEvent, failure?: FailureContext): Promise<RecoveryRecord | null>;
    start(input: RecoveryRequest): Promise<RecoveryRecord>;
    complete(input: RecoveryCompletion): Promise<void>;
    escalate(input: EscalationRequest, completionFingerprint?: string): Promise<ApprovalRecord>;
    private requireTask;
    private selectStrategy;
}
//# sourceMappingURL=recovery.d.ts.map