import {
  ApprovalRecordSchema,
  CorrelationIdSchema,
  DomainEventSchema,
  EventIdSchema,
  TaskIdSchema,
  approvalId,
  eventId,
  type ActorRef,
  type ApprovalId,
  type ApprovalRecord,
  type CorrelationId,
  type DomainEvent,
  type OutboxCommand
} from '@aicompany/contracts';
import type { SaveApprovalDecisionAndTaskInput, TransactionalPersistence } from './ports';
import type { TaskRepository } from './repository';
import { OptimisticConcurrencyError } from './repository';
import { transitionTask } from './task-state-machine';

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
  create(
    record: ApprovalRecord,
    idempotencyKey: string,
    fingerprint: string,
    event: DomainEvent,
    command: OutboxCommand
  ): Promise<ApprovalRecord>;
  get(id: ApprovalId): Promise<ApprovalRecord | null>;
  findByIdempotencyKey(key: string): Promise<{ fingerprint: string; record: ApprovalRecord } | null>;
  findDecision(key: string): Promise<{ fingerprint: string; record: ApprovalRecord } | null>;
  commitDecision(
    record: ApprovalRecord,
    expectedVersion: number,
    event: DomainEvent,
    idempotencyKey: string,
    requestFingerprint: string
  ): Promise<ApprovalRecord>;
}

export class ApprovalServiceError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ApprovalServiceError';
  }
}

const clone = <T>(value: T): T => globalThis.structuredClone(value);

const eventFor = (
  record: ApprovalRecord,
  eventType: 'APPROVAL_REQUESTED' | 'APPROVAL_APPROVED' | 'APPROVAL_REJECTED',
  payload: DomainEvent['payload'],
  actor: ActorRef,
  occurredAt: Date,
  aggregateVersion: number,
  eventIdentifier: string
): DomainEvent => DomainEventSchema.parse({
  eventId: eventId(eventIdentifier),
  aggregateType: 'APPROVAL',
  aggregateId: record.approvalId,
  aggregateVersion,
  eventType,
  actor,
  correlationId: record.correlationId,
  causationId: EventIdSchema.parse(record.causationId),
  occurredAt,
  payload
});

export interface InMemoryApprovalStoreSnapshot {
  records: Array<[ApprovalId, ApprovalRecord]>;
  requestKeys: Array<[string, { fingerprint: string; record: ApprovalRecord }]>;
  decisionKeys: Array<[string, { fingerprint: string; record: ApprovalRecord }]>;
  events: DomainEvent[];
  commands: OutboxCommand[];
}

export class InMemoryApprovalStore implements ApprovalStore {
  private readonly records = new Map<ApprovalId, ApprovalRecord>();
  private readonly requestKeys = new Map<string, { fingerprint: string; record: ApprovalRecord }>();
  private readonly decisionKeys = new Map<string, { fingerprint: string; record: ApprovalRecord }>();
  public readonly events: DomainEvent[] = [];
  public readonly commands: OutboxCommand[] = [];

  public async create(
    record: ApprovalRecord,
    idempotencyKey: string,
    fingerprint: string,
    event: DomainEvent,
    command: OutboxCommand
  ): Promise<ApprovalRecord> {
    const prior = this.requestKeys.get(idempotencyKey);
    if (prior !== undefined) {
      if (prior.fingerprint !== fingerprint) {
        throw new ApprovalServiceError('Idempotency key was reused with different request data');
      }
      return clone(prior.record);
    }

    const parsed = ApprovalRecordSchema.parse(record);
    this.records.set(parsed.approvalId, clone(parsed));
    this.requestKeys.set(idempotencyKey, { fingerprint, record: clone(parsed) });
    this.events.push(clone(event));
    this.commands.push(clone(command));
    return clone(parsed);
  }

  public async get(id: ApprovalId): Promise<ApprovalRecord | null> {
    const record = this.records.get(id);
    return record === undefined ? null : clone(record);
  }

  public async findByIdempotencyKey(key: string): Promise<{ fingerprint: string; record: ApprovalRecord } | null> {
    const value = this.requestKeys.get(key);
    return value === undefined ? null : { fingerprint: value.fingerprint, record: clone(value.record) };
  }

  public async findDecision(key: string): Promise<{ fingerprint: string; record: ApprovalRecord } | null> {
    const value = this.decisionKeys.get(key);
    return value === undefined ? null : { fingerprint: value.fingerprint, record: clone(value.record) };
  }

  public async commitDecision(
    record: ApprovalRecord,
    expectedVersion: number,
    event: DomainEvent,
    idempotencyKey: string,
    requestFingerprint: string
  ): Promise<ApprovalRecord> {
    const prior = this.decisionKeys.get(idempotencyKey);
    if (prior !== undefined) {
      if (prior.fingerprint !== requestFingerprint) {
        throw new ApprovalServiceError('Idempotency key was reused with different decision data');
      }
      return clone(prior.record);
    }

    const existing = this.records.get(record.approvalId);
    if (existing === undefined) throw new ApprovalServiceError('Approval was not found');
    if (existing.version !== expectedVersion) {
      throw new OptimisticConcurrencyError(record.approvalId, expectedVersion, existing.version);
    }
    if (existing.state !== 'PENDING' || record.version !== expectedVersion + 1) {
      throw new ApprovalServiceError('Approval is no longer pending');
    }

    const parsed = ApprovalRecordSchema.parse(record);
    this.records.set(parsed.approvalId, clone(parsed));
    this.decisionKeys.set(idempotencyKey, { fingerprint: requestFingerprint, record: clone(parsed) });
    this.events.push(clone(event));
    return clone(parsed);
  }

  public snapshot(): InMemoryApprovalStoreSnapshot {
    return clone({
      records: [...this.records.entries()],
      requestKeys: [...this.requestKeys.entries()],
      decisionKeys: [...this.decisionKeys.entries()],
      events: this.events,
      commands: this.commands
    });
  }

  public restore(snapshot: InMemoryApprovalStoreSnapshot): void {
    this.records.clear();
    this.requestKeys.clear();
    this.decisionKeys.clear();
    for (const [id, record] of snapshot.records) this.records.set(id, clone(record));
    for (const [key, value] of snapshot.requestKeys) this.requestKeys.set(key, clone(value));
    for (const [key, value] of snapshot.decisionKeys) this.decisionKeys.set(key, clone(value));
    this.events.splice(0, this.events.length, ...clone(snapshot.events));
    this.commands.splice(0, this.commands.length, ...clone(snapshot.commands));
  }
}

export interface ApprovalServiceOptions {
  approvals: ApprovalStore;
  taskRepository: TaskRepository;
  transactionalPersistence: TransactionalPersistence;
  now?: () => Date;
  newApprovalId?: (input: ApprovalRequest) => ApprovalId;
}

export class ApprovalServiceImpl implements ApprovalService {
  private readonly now: () => Date;

  public constructor(private readonly options: ApprovalServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  public async request(input: ApprovalRequest): Promise<ApprovalRecord> {
    const normalized = {
      ...input,
      subjectId: input.subjectId.trim(),
      reason: input.reason.trim(),
      idempotencyKey: input.idempotencyKey.trim(),
      correlationId: CorrelationIdSchema.parse(input.correlationId)
    };
    if (!normalized.subjectId || !normalized.reason || !normalized.idempotencyKey) {
      throw new ApprovalServiceError('Approval request fields cannot be empty');
    }

    const fingerprint = JSON.stringify({
      subjectType: normalized.subjectType,
      subjectId: normalized.subjectId,
      reason: normalized.reason,
      requestedBy: normalized.requestedBy,
      correlationId: normalized.correlationId
    });
    const prior = await this.options.approvals.findByIdempotencyKey(normalized.idempotencyKey);
    if (prior !== null) {
      if (prior.fingerprint !== fingerprint) {
        throw new ApprovalServiceError('Idempotency key was reused with different request data');
      }
      return prior.record;
    }

    const now = this.now();
    const id = this.options.newApprovalId?.(normalized)
      ?? approvalId(`approval:${normalized.subjectType}:${normalized.subjectId}:${normalized.idempotencyKey}`);
    const causationId = eventId(`approval:${id}:request`);
    const record = ApprovalRecordSchema.parse({
      approvalId: id,
      subjectType: normalized.subjectType,
      subjectId: normalized.subjectId,
      reason: normalized.reason,
      requestedBy: normalized.requestedBy,
      correlationId: normalized.correlationId,
      causationId,
      version: 0,
      createdAt: now,
      updatedAt: now,
      state: 'PENDING',
      decision: null,
      decisionReason: null,
      decidedBy: null,
      decidedAt: null
    });
    const event = eventFor(
      record,
      'APPROVAL_REQUESTED',
      {
        approvalId: id,
        subjectType: record.subjectType,
        subjectId: record.subjectId,
        reason: record.reason
      },
      record.requestedBy,
      now,
      1,
      `approval:${id}:request`
    );
    const command: OutboxCommand = {
      commandId: `request-approval:${id}`,
      type: 'REQUEST_APPROVAL',
      payload: {
        subjectType: record.subjectType,
        subjectId: record.subjectId,
        reason: record.reason
      },
      actor: record.requestedBy,
      issuedAt: now,
      availableAt: now,
      correlationId: record.correlationId,
      causationId: event.eventId
    };
    return this.options.approvals.create(record, normalized.idempotencyKey, fingerprint, event, command);
  }

  public async decide(input: ApprovalDecision): Promise<ApprovalRecord> {
    if (input.actor.kind !== 'CEO') {
      throw new ApprovalServiceError('Only the CEO may decide approvals');
    }
    const idempotencyKey = input.idempotencyKey.trim();
    const decisionReason = input.reason.trim();
    if (!idempotencyKey || !decisionReason) {
      throw new ApprovalServiceError('Decision reason and idempotency key are required');
    }
    const requestFingerprint = JSON.stringify({
      approvalId: input.approvalId,
      decision: input.decision,
      actor: input.actor,
      decisionReason
    });
    const replay = await this.options.approvals.findDecision(idempotencyKey);
    if (replay !== null) {
      if (replay.fingerprint !== requestFingerprint) {
        throw new ApprovalServiceError('Idempotency key was reused with different decision data');
      }
      return replay.record;
    }

    const current = await this.options.approvals.get(input.approvalId);
    if (current === null) throw new ApprovalServiceError('Approval was not found');
    if (current.version !== input.expectedVersion) {
      throw new OptimisticConcurrencyError(current.approvalId, input.expectedVersion, current.version);
    }
    if (current.state !== 'PENDING') throw new ApprovalServiceError('Approval is no longer pending');

    const now = this.now();
    const approved = input.decision === 'APPROVE';
    const next = ApprovalRecordSchema.parse({
      ...current,
      version: current.version + 1,
      updatedAt: now,
      state: approved ? 'APPROVED' : 'REJECTED',
      decision: input.decision,
      decisionReason,
      decidedBy: input.actor,
      decidedAt: now,
      reason: current.reason
    });
    const approvalEvent = eventFor(
      next,
      approved ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED',
      approved
        ? { approvalId: next.approvalId, decisionReason, decidedAt: now }
        : { approvalId: next.approvalId, reason: decisionReason, decisionReason },
      input.actor,
      now,
      current.version + 1,
      `approval:${next.approvalId}:v${current.version + 1}`
    );

    let task: Awaited<ReturnType<TaskRepository['get']>> = null;
    let taskEvent: DomainEvent | undefined;
    const commands: OutboxCommand[] = [];
    if (current.subjectType === 'DEPLOYMENT') {
      task = await this.options.taskRepository.get(TaskIdSchema.parse(current.subjectId));
      if (task === null || task.state !== 'WAITING_FOR_APPROVAL' || task.isDeployment !== true) {
        throw new ApprovalServiceError('Deployment task is not waiting for approval');
      }
      const transition = transitionTask(
        task,
        approved
          ? { type: 'DEPLOYMENT_APPROVED', approvalId: next.approvalId, approvalRecord: next }
          : { type: 'DEPLOYMENT_REJECTED', approvalId: next.approvalId, reason: decisionReason, approvalRecord: next },
        { actor: input.actor, now, evidenceIds: [], isDeployment: true }
      );
      task = transition.task;
      taskEvent = transition.event;
      if (approved) {
        commands.push({
          commandId: `deploy:${task.id}:${next.approvalId}`,
          type: 'DEPLOY',
          payload: { taskId: task.id, approvalId: next.approvalId },
          actor: input.actor,
          issuedAt: now,
          availableAt: now,
          correlationId: next.correlationId,
          causationId: taskEvent.eventId
        });
      }
    }

    const atomicInput: SaveApprovalDecisionAndTaskInput = {
      approval: next,
      expectedApprovalVersion: current.version,
      approvalEvent,
      commands,
      idempotencyKey,
      requestFingerprint
    };
    if (task !== null) {
      if (taskEvent === undefined) throw new ApprovalServiceError('Deployment transition did not produce an event');
      atomicInput.task = task;
      atomicInput.expectedTaskVersion = task.version - 1;
      atomicInput.taskEvent = taskEvent;
    }
    await this.options.transactionalPersistence.saveApprovalDecisionAndTask(atomicInput);
    return next;
  }

  public async get(id: ApprovalId): Promise<ApprovalRecord> {
    const record = await this.options.approvals.get(id);
    if (record === null) throw new ApprovalServiceError('Approval was not found');
    return record;
  }
}
