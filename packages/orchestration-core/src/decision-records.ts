import {
  ActorRefSchema,
  CorrelationIdSchema,
  EventIdSchema,
  TaskIdSchema,
  type ActorRef,
  type CorrelationId,
  type EventId
} from '@aicompany/contracts';
import type { ChannelScope } from './channel-policy';

export interface RecordDecisionInput {
  actor: ActorRef;
  scope: ChannelScope;
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
}

export interface DecisionRecordStore {
  append(record: DecisionRecord): Promise<void>;
  list(scope: ChannelScope): Promise<DecisionRecord[]>;
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

export class InMemoryDecisionRecordStore implements DecisionRecordStore {
  private readonly records: DecisionRecord[] = [];

  public async append(record: DecisionRecord): Promise<void> {
    if (this.records.some((existing) => existing.decisionId === record.decisionId)) throw new Error(`Decision ID ${record.decisionId} already exists`);
    this.records.push(cloneRecord(record));
  }

  public async list(scope: ChannelScope): Promise<DecisionRecord[]> {
    return this.records.filter((record) => scopeKey(record.scope) === scopeKey(scope)).map(cloneRecord);
  }
}

export class InMemoryDecisionRecordService implements DecisionRecordService {
  public constructor(private readonly store: DecisionRecordStore, private readonly options: DecisionRecordOptions) {}

  public async record(input: RecordDecisionInput): Promise<DecisionRecord> {
    const subject = input.subject.trim();
    const rationale = input.rationale.trim();
    const options = input.options.map((option) => option.trim());
    const selectedOption = input.selectedOption.trim();
    if (!subject || !rationale || options.length === 0 || options.some((option) => !option) || !options.includes(selectedOption)) {
      throw new Error('Decision requires a subject, rationale, considered options, and a selected option from that list');
    }
    if (new Set(options).size !== options.length) throw new Error('Decision options must be unique');
    const record: DecisionRecord = {
      ...input,
      actor: ActorRefSchema.parse(input.actor),
      scope: input.scope.kind === 'task'
        ? { kind: 'task', taskId: TaskIdSchema.parse(input.scope.taskId) }
        : { kind: 'project', projectId: input.scope.projectId.trim() },
      subject, options, selectedOption, rationale, evidenceIds: [...input.evidenceIds],
      correlationId: CorrelationIdSchema.parse(input.correlationId), causationId: EventIdSchema.parse(input.causationId),
      decisionId: this.options.newDecisionId(), createdAt: (this.options.now ?? (() => new Date()))()
    };
    await this.store.append(record);
    return cloneRecord(record);
  }
}
