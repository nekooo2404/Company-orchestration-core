import {
  ActorRefSchema,
  CorrelationIdSchema,
  EventIdSchema,
  TaskIdSchema,
  type ActorRef,
  type CorrelationId,
  type EventId
} from '@aicompany/contracts';
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

const scopeKey = (scope: ChannelScope): string => scope.kind === 'task'
  ? `task:${TaskIdSchema.parse(scope.taskId)}`
  : `project:${scope.projectId.trim()}`;
const cloneRecord = (record: DecisionRecord): DecisionRecord => ({
  ...record, actor: { ...record.actor }, scope: { ...record.scope }, options: [...record.options],
  evidenceIds: [...record.evidenceIds], createdAt: new Date(record.createdAt)
});
const fingerprintOf = (input: RecordDecisionInput): string => JSON.stringify({
  actor: input.actor,
  scope: input.scope.kind === 'task'
    ? { kind: 'task', taskId: TaskIdSchema.parse(input.scope.taskId) }
    : { kind: 'project', projectId: input.scope.projectId.trim() },
  subject: input.subject.trim(), options: input.options.map((option) => option.trim()),
  selectedOption: input.selectedOption.trim(), rationale: input.rationale.trim(),
  evidenceIds: input.evidenceIds, correlationId: input.correlationId, causationId: input.causationId,
  supersedesDecisionId: input.supersedesDecisionId ?? null
});

export class InMemoryDecisionRecordStore implements DecisionRecordStore {
  private readonly records: DecisionRecord[] = [];
  private readonly idempotency = new Map<string, { fingerprint: string; record: DecisionRecord }>();

  public constructor(private readonly authorization: ChannelAuthorization) {}

  public async record(actor: ActorRef, scope: ChannelScope, idempotencyKey: string, fingerprint: string, create: () => DecisionRecord): Promise<DecisionRecord> {
    await this.authorization.authorizeWrite(actor, scope);
    const prior = this.idempotency.get(idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new Error('Decision idempotency key was reused with different input');
      return cloneRecord(prior.record);
    }
    const record = create();
    const stored = cloneRecord(record);
    this.records.push(stored);
    this.idempotency.set(idempotencyKey, { fingerprint, record: stored });
    return cloneRecord(stored);
  }

  public async list(actor: ActorRef, scope: ChannelScope): Promise<DecisionRecord[]> {
    await this.authorization.authorizeRead(actor, scope);
    return this.records.filter((record) => scopeKey(record.scope) === scopeKey(scope)).map(cloneRecord);
  }
}

export class InMemoryDecisionRecordService implements DecisionRecordService {
  public constructor(
    private readonly store: DecisionRecordStore,
    private readonly authorization: ChannelAuthorization,
    private readonly options: DecisionRecordOptions
  ) {}

  public async record(input: RecordDecisionInput): Promise<DecisionRecord> {
    await this.authorization.authorizeWrite(input.actor, input.scope);
    const subject = input.subject.trim();
    const rationale = input.rationale.trim();
    const options = input.options.map((option) => option.trim());
    const selectedOption = input.selectedOption.trim();
    if (!input.idempotencyKey.trim()) throw new Error('Decision idempotency key is required');
    if (!subject || !rationale || options.length === 0 || options.some((option) => !option) || !options.includes(selectedOption)) {
      throw new Error('Decision requires a subject, rationale, considered options, and a selected option from that list');
    }
    if (new Set(options).size !== options.length) throw new Error('Decision options must be unique');
    const normalized: RecordDecisionInput = {
      ...input,
      actor: ActorRefSchema.parse(input.actor),
      scope: input.scope.kind === 'task'
        ? { kind: 'task', taskId: TaskIdSchema.parse(input.scope.taskId) }
        : { kind: 'project', projectId: input.scope.projectId.trim() },
      idempotencyKey: input.idempotencyKey.trim(), subject, options, selectedOption, rationale,
      evidenceIds: [...input.evidenceIds], correlationId: CorrelationIdSchema.parse(input.correlationId),
      causationId: EventIdSchema.parse(input.causationId)
    };
    const fingerprint = fingerprintOf(normalized);
    return this.store.record(normalized.actor, normalized.scope, normalized.idempotencyKey, fingerprint, () => ({
      ...normalized,
      decisionId: this.options.newDecisionId(),
      createdAt: (this.options.now ?? (() => new Date()))()
    }));
  }

  public async list(actor: ActorRef, scope: ChannelScope): Promise<DecisionRecord[]> {
    await this.authorization.authorizeRead(actor, scope);
    return this.store.list(actor, scope);
  }
}
