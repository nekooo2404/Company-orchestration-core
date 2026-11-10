import { type ActorRef, type CorrelationId, type EventId } from '@aicompany/contracts';
import { type ChannelAuthorization, type ChannelScope } from './channel-policy.js';
export interface RecordDecisionInput {
    actor: ActorRef;
    scope: ChannelScope;
    idempotencyKey: string;
    subject: string;
    options: string[];
    selectedOption: string;
    rationale: string;
    evidenceIds: string[];
    correlationId: CorrelationId;
    causationId: EventId;
    supersedesDecisionId?: string;
}
export interface DecisionRecord extends RecordDecisionInput {
    decisionId: string;
    createdAt: Date;
}
export interface DecisionRecordService {
    record(input: RecordDecisionInput): Promise<DecisionRecord>;
    list(actor: ActorRef, scope: ChannelScope): Promise<DecisionRecord[]>;
}
export interface DecisionRecordStore {
    record(actor: ActorRef, scope: ChannelScope, idempotencyKey: string, fingerprint: string, create: () => DecisionRecord): Promise<DecisionRecord>;
    list(actor: ActorRef, scope: ChannelScope): Promise<DecisionRecord[]>;
}
export interface DecisionRecordOptions {
    newDecisionId: () => string;
    now?: () => Date;
}
export declare class InMemoryDecisionRecordStore implements DecisionRecordStore {
    private readonly authorization;
    private readonly records;
    private readonly idempotency;
    constructor(authorization: ChannelAuthorization);
    record(actor: ActorRef, scope: ChannelScope, idempotencyKey: string, fingerprint: string, create: () => DecisionRecord): Promise<DecisionRecord>;
    list(actor: ActorRef, scope: ChannelScope): Promise<DecisionRecord[]>;
}
export declare class InMemoryDecisionRecordService implements DecisionRecordService {
    private readonly store;
    private readonly authorization;
    private readonly options;
    constructor(store: DecisionRecordStore, authorization: ChannelAuthorization, options: DecisionRecordOptions);
    record(input: RecordDecisionInput): Promise<DecisionRecord>;
    list(actor: ActorRef, scope: ChannelScope): Promise<DecisionRecord[]>;
}
//# sourceMappingURL=decision-records.d.ts.map