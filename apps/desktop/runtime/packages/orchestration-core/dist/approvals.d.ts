import { type ActorRef, type ApprovalId, type ApprovalRecord, type CorrelationId, type DomainEvent, type OutboxCommand } from '@aicompany/contracts';
import type { TransactionalPersistence } from './ports.js';
import type { TaskRepository } from './repository.js';
export interface ApprovalRequest {
    subjectType: ApprovalRecord['subjectType'];
    subjectId: string;
    reason: string;
    requestedBy: ActorRef;
    correlationId: CorrelationId;
    idempotencyKey: string;
}
export interface ApprovalDecision {
    approvalId: ApprovalId;
    decision: 'APPROVE' | 'REJECT';
    actor: ActorRef;
    reason: string;
    expectedVersion: number;
    idempotencyKey: string;
}
export interface ApprovalService {
    request(input: ApprovalRequest): Promise<ApprovalRecord>;
    decide(input: ApprovalDecision): Promise<ApprovalRecord>;
    get(id: ApprovalId): Promise<ApprovalRecord>;
}
export interface ApprovalStore {
    commitRequest(record: ApprovalRecord, idempotencyKey: string, fingerprint: string, event: DomainEvent, command: OutboxCommand): Promise<ApprovalRecord>;
    get(id: ApprovalId): Promise<ApprovalRecord | null>;
    findByIdempotencyKey(key: string): Promise<{
        fingerprint: string;
        record: ApprovalRecord;
    } | null>;
    findDecision(key: string): Promise<{
        fingerprint: string;
        record: ApprovalRecord;
    } | null>;
    commitDecision(record: ApprovalRecord, expectedVersion: number, event: DomainEvent, idempotencyKey: string, requestFingerprint: string): Promise<ApprovalRecord>;
}
export declare class ApprovalServiceError extends Error {
    constructor(message: string);
}
export interface InMemoryApprovalStoreSnapshot {
    records: Array<[ApprovalId, ApprovalRecord]>;
    requestKeys: Array<[string, {
        fingerprint: string;
        record: ApprovalRecord;
    }]>;
    decisionKeys: Array<[string, {
        fingerprint: string;
        record: ApprovalRecord;
    }]>;
    events: DomainEvent[];
    commands: OutboxCommand[];
}
export declare class InMemoryApprovalStore implements ApprovalStore {
    private readonly records;
    private readonly requestKeys;
    private readonly decisionKeys;
    readonly events: DomainEvent[];
    readonly commands: OutboxCommand[];
    commitRequest(record: ApprovalRecord, idempotencyKey: string, fingerprint: string, event: DomainEvent, command: OutboxCommand): Promise<ApprovalRecord>;
    get(id: ApprovalId): Promise<ApprovalRecord | null>;
    findByIdempotencyKey(key: string): Promise<{
        fingerprint: string;
        record: ApprovalRecord;
    } | null>;
    findDecision(key: string): Promise<{
        fingerprint: string;
        record: ApprovalRecord;
    } | null>;
    commitDecision(record: ApprovalRecord, expectedVersion: number, event: DomainEvent, idempotencyKey: string, requestFingerprint: string): Promise<ApprovalRecord>;
    snapshot(): InMemoryApprovalStoreSnapshot;
    restore(snapshot: InMemoryApprovalStoreSnapshot): void;
}
export interface ApprovalServiceOptions {
    approvals: ApprovalStore;
    taskRepository: TaskRepository;
    transactionalPersistence: TransactionalPersistence;
    now?: () => Date;
    newApprovalId?: (input: ApprovalRequest) => ApprovalId;
}
export declare class ApprovalServiceImpl implements ApprovalService {
    private readonly options;
    private readonly now;
    constructor(options: ApprovalServiceOptions);
    request(input: ApprovalRequest): Promise<ApprovalRecord>;
    decide(input: ApprovalDecision): Promise<ApprovalRecord>;
    get(id: ApprovalId): Promise<ApprovalRecord>;
}
//# sourceMappingURL=approvals.d.ts.map