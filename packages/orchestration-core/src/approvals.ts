import { ApprovalRecordSchema, CorrelationIdSchema, EventIdSchema, TaskIdSchema, approvalId, eventId, type ActorRef, type ApprovalId, type ApprovalRecord, type CorrelationId, type DomainEvent, type OutboxCommand } from '@aicompany/contracts';
import type { TransactionalPersistence } from './ports';
import type { TaskRepository } from './repository';
import { OptimisticConcurrencyError } from './repository';
import { transitionTask } from './task-state-machine';

export interface ApprovalRequest { subjectType: ApprovalRecord['subjectType']; subjectId: string; reason: string; requestedBy: ActorRef; correlationId: CorrelationId; idempotencyKey: string }
export interface ApprovalDecision { approvalId: ApprovalId; decision: 'APPROVE' | 'REJECT'; actor: ActorRef; reason: string; expectedVersion: number; idempotencyKey: string }
export interface ApprovalService { request(input: ApprovalRequest): Promise<ApprovalRecord>; decide(input: ApprovalDecision): Promise<ApprovalRecord>; get(id: ApprovalId): Promise<ApprovalRecord> }

export interface ApprovalStore {
  create(record: ApprovalRecord, idempotencyKey: string, fingerprint: string, event: DomainEvent, command: OutboxCommand): Promise<ApprovalRecord>;
  get(id: ApprovalId): Promise<ApprovalRecord | null>;
  findByIdempotencyKey(key: string): Promise<{ fingerprint: string; record: ApprovalRecord } | null>;
  decide(record: ApprovalRecord, expectedVersion: number, event: DomainEvent): Promise<ApprovalRecord>;
  findDecision(key: string): Promise<{ fingerprint: string; record: ApprovalRecord } | null>;
  saveDecisionKey(key: string, fingerprint: string, record: ApprovalRecord): Promise<void>;
}

export class ApprovalServiceError extends Error { public constructor(message: string) { super(message); this.name = 'ApprovalServiceError'; } }

const freezeClone = <T>(value: T): T => globalThis.structuredClone(value);
const eventFor = (record: ApprovalRecord, type: 'APPROVAL_REQUESTED' | 'APPROVAL_APPROVED' | 'APPROVAL_REJECTED', payload: DomainEvent['payload'], version: number, actor: ActorRef, at: Date): DomainEvent => ({
  eventId: eventId(`approval:${record.approvalId}:v${version + 1}`), aggregateType: 'APPROVAL', aggregateId: record.approvalId,
  aggregateVersion: version + 1, eventType: type, actor, correlationId: record.correlationId,
  causationId: EventIdSchema.parse(record.causationId), occurredAt: at, payload
} as DomainEvent);

export class InMemoryApprovalStore implements ApprovalStore {
  private readonly records = new Map<ApprovalId, ApprovalRecord>();
  private readonly keys = new Map<string, { fingerprint: string; record: ApprovalRecord }>();
  private readonly decisionKeys = new Map<string, { fingerprint: string; record: ApprovalRecord }>();
  public readonly events: DomainEvent[] = [];
  public readonly commands: OutboxCommand[] = [];

  public async create(record: ApprovalRecord, key: string, fingerprint: string, event: DomainEvent, command: OutboxCommand): Promise<ApprovalRecord> {
    const prior = this.keys.get(key);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new ApprovalServiceError('Idempotency key was reused with different request data');
      return freezeClone(prior.record);
    }
    const parsed = ApprovalRecordSchema.parse(record);
    this.records.set(parsed.approvalId, freezeClone(parsed)); this.keys.set(key, { fingerprint, record: parsed });
    this.events.push(freezeClone(event)); this.commands.push(freezeClone(command));
    return freezeClone(parsed);
  }
  public async get(id: ApprovalId): Promise<ApprovalRecord | null> { const value = this.records.get(id); return value ? freezeClone(value) : null; }
  public async findByIdempotencyKey(key: string) { const value = this.keys.get(key); return value ? { fingerprint: value.fingerprint, record: freezeClone(value.record) } : null; }
  public async decide(record: ApprovalRecord, expectedVersion: number, event: DomainEvent): Promise<ApprovalRecord> {
    const existing = this.records.get(record.approvalId);
    if (!existing) throw new ApprovalServiceError('Approval was not found');
    if (existing.version !== expectedVersion) throw new OptimisticConcurrencyError(record.approvalId, expectedVersion, existing.version);
    if (existing.state !== 'PENDING' || record.version !== expectedVersion + 1) throw new ApprovalServiceError('Approval is no longer pending');
    const parsed = ApprovalRecordSchema.parse(record); this.records.set(parsed.approvalId, freezeClone(parsed));
    this.events.push(freezeClone(event)); return freezeClone(parsed);
  }
  public async findDecision(key: string): Promise<{ fingerprint: string; record: ApprovalRecord } | null> {
    const value = this.decisionKeys.get(key); return value ? { fingerprint: value.fingerprint, record: freezeClone(value.record) } : null;
  }
  public async saveDecisionKey(key: string, fingerprint: string, record: ApprovalRecord): Promise<void> {
    this.decisionKeys.set(key, { fingerprint, record: freezeClone(record) });
  }
}

export interface ApprovalServiceOptions { approvals: ApprovalStore; taskRepository: TaskRepository; transactionalPersistence: TransactionalPersistence; now?: () => Date; newApprovalId?: (input: ApprovalRequest) => ApprovalId }

export class ApprovalServiceImpl implements ApprovalService {
  private readonly now: () => Date;
  public constructor(private readonly options: ApprovalServiceOptions) { this.now = options.now ?? (() => new Date()); }

  public async request(input: ApprovalRequest): Promise<ApprovalRecord> {
    const normalized = { ...input, subjectId: input.subjectId.trim(), reason: input.reason.trim(), idempotencyKey: input.idempotencyKey.trim(), correlationId: CorrelationIdSchema.parse(input.correlationId) };
    if (!normalized.subjectId || !normalized.reason || !normalized.idempotencyKey) throw new ApprovalServiceError('Approval request fields cannot be empty');
    const fingerprint = JSON.stringify({ ...normalized, requestedBy: input.requestedBy });
    const prior = await this.options.approvals.findByIdempotencyKey(normalized.idempotencyKey);
    if (prior) { if (prior.fingerprint !== fingerprint) throw new ApprovalServiceError('Idempotency key was reused with different request data'); return prior.record; }
    const now = this.now();
    const id = this.options.newApprovalId?.(normalized) ?? approvalId(`approval:${normalized.subjectType}:${normalized.subjectId}:${normalized.idempotencyKey}`);
    const requestEventId = eventId(`approval:${id}:v1`);
    const record = ApprovalRecordSchema.parse({ approvalId: id, subjectType: normalized.subjectType, subjectId: normalized.subjectId, reason: normalized.reason, requestedBy: normalized.requestedBy, correlationId: normalized.correlationId, causationId: requestEventId, version: 0, createdAt: now, updatedAt: now, state: 'PENDING', decision: null, decidedBy: null, decidedAt: null });
    const event = eventFor(record, 'APPROVAL_REQUESTED', { approvalId: id, subjectType: record.subjectType, subjectId: record.subjectId, reason: record.reason }, 0, record.requestedBy, now);
    const command: OutboxCommand = { commandId: `request-approval:${id}`, type: 'REQUEST_APPROVAL', payload: { subjectType: record.subjectType, subjectId: record.subjectId, reason: record.reason }, actor: record.requestedBy, issuedAt: now, availableAt: now, correlationId: record.correlationId, causationId: event.eventId };
    return this.options.approvals.create(record, normalized.idempotencyKey, fingerprint, event, command);
  }

  public async decide(input: ApprovalDecision): Promise<ApprovalRecord> {
    if (input.actor.kind !== 'CEO') throw new ApprovalServiceError('Only the CEO may decide approvals');
    if (!input.idempotencyKey.trim()) throw new ApprovalServiceError('Decision idempotency key is required');
    const decisionFingerprint = JSON.stringify({ approvalId: input.approvalId, decision: input.decision, actor: input.actor, reason: input.reason.trim() });
    const replay = await this.options.approvals.findDecision(input.idempotencyKey);
    if (replay) { if (replay.fingerprint !== decisionFingerprint) throw new ApprovalServiceError('Idempotency key was reused with different decision data'); return replay.record; }
    const current = await this.options.approvals.get(input.approvalId);
    if (!current) throw new ApprovalServiceError('Approval was not found');
    if (current.version !== input.expectedVersion) throw new OptimisticConcurrencyError(current.approvalId, input.expectedVersion, current.version);
    if (current.state !== 'PENDING') throw new ApprovalServiceError('Approval is no longer pending');
    const reason = input.reason.trim(); if (!reason) throw new ApprovalServiceError('Decision reason is required');
    const now = this.now(); const approved = input.decision === 'APPROVE';
    const next = ApprovalRecordSchema.parse({ ...current, version: current.version + 1, updatedAt: now, state: approved ? 'APPROVED' : 'REJECTED', decision: input.decision, decidedBy: input.actor, decidedAt: now, reason: approved ? current.reason : reason });
    const event = eventFor(next, approved ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED', approved ? { approvalId: next.approvalId, decidedAt: now } : { approvalId: next.approvalId, reason }, current.version, input.actor, now);
    const saved = await this.options.approvals.decide(next, input.expectedVersion, event);
    if (current.subjectType === 'DEPLOYMENT') await this.applyDeploymentDecision(saved, input, event, now);
    await this.options.approvals.saveDecisionKey(input.idempotencyKey, decisionFingerprint, saved);
    return saved;
  }

  public async get(id: ApprovalId): Promise<ApprovalRecord> { const record = await this.options.approvals.get(id); if (!record) throw new ApprovalServiceError('Approval was not found'); return record; }

  private async applyDeploymentDecision(record: ApprovalRecord, input: ApprovalDecision, event: DomainEvent, now: Date): Promise<void> {
    const task = await this.options.taskRepository.get(TaskIdSchema.parse(record.subjectId));
    if (!task || task.state !== 'WAITING_FOR_APPROVAL' || !task.isDeployment) throw new ApprovalServiceError('Deployment task is not waiting for approval');
    const transition = transitionTask(task, record.state === 'APPROVED' ? { type: 'DEPLOYMENT_APPROVED', approvalId: record.approvalId, approvalRecord: record } : { type: 'DEPLOYMENT_REJECTED', approvalId: record.approvalId, reason: input.reason.trim(), approvalRecord: record }, { actor: input.actor, now, evidenceIds: [], isDeployment: true });
    const commands: OutboxCommand[] = record.state === 'APPROVED' ? [{ commandId: `deploy:${task.id}:${record.approvalId}`, type: 'DEPLOY', payload: { taskId: task.id, approvalId: record.approvalId }, actor: input.actor, issuedAt: now, availableAt: now, correlationId: record.correlationId, causationId: event.eventId }] : [];
    await this.options.transactionalPersistence.saveTaskAndAppend({ task: transition.task, expectedVersion: task.version, events: [transition.event], commands });
  }
}
