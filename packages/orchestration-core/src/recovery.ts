import {
  ApprovalRecordSchema,
  CorrelationIdSchema,
  EventIdSchema,
  TaskIdSchema,
  approvalId,
  type ActorRef,
  type ApprovalRecord,
  type CorrelationId,
  type DomainEvent,
  type Task,
  type TaskId
} from '@aicompany/contracts';
import { failureFingerprint } from './failure-fingerprint.js';
import type { TransactionalPersistence } from './ports.js';
import type { TaskRepository } from './repository.js';
import { transitionTask } from './task-state-machine.js';

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

export class InMemoryRecoveryRecordStore implements RecoveryRecordStore {
  private readonly records = new Map<string, RecoveryRecord>();

  public async get(recoveryId: string): Promise<RecoveryRecord | null> {
    const record = this.records.get(recoveryId);
    return record === undefined ? null : structuredClone(record);
  }

  public async list(taskId: TaskId): Promise<RecoveryRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.taskId === taskId)
      .sort((left, right) => left.cycle - right.cycle)
      .map((record) => structuredClone(record));
  }

  public async save(record: RecoveryRecord): Promise<void> {
    const existing = this.records.get(record.recoveryId);
    if (existing !== undefined && (existing.taskId !== record.taskId || existing.cycle !== record.cycle)) {
      throw new Error(`Recovery ID ${record.recoveryId} is already assigned`);
    }
    this.records.set(record.recoveryId, structuredClone(record));
  }
  public snapshot(): Map<string, RecoveryRecord> { return structuredClone(this.records); }
  public restore(snapshot: Map<string, RecoveryRecord>): void {
    this.records.clear();
    for (const [id, record] of snapshot) this.records.set(id, structuredClone(record));
  }
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

const SYSTEM_ACTOR: ActorRef = { kind: 'SYSTEM', name: 'recovery-coordinator' };
const cloneRecord = (record: RecoveryRecord): RecoveryRecord => structuredClone(record);

export class RecoveryCoordinatorService implements RecoveryCoordinator, RecoveryEventConsumer {
  private readonly now: () => Date;

  public constructor(private readonly options: RecoveryCoordinatorOptions) {
    this.now = options.now ?? (() => new Date());
  }

  public async handleTaskEvent(event: DomainEvent, failure?: FailureContext): Promise<RecoveryRecord | null> {
    if (event.aggregateType !== 'TASK' || (event.eventType !== 'BLOCKED' && event.eventType !== 'TASK_FAILED')) {
      return null;
    }
    const taskId = TaskIdSchema.parse(event.aggregateId);
    const message = event.eventType === 'BLOCKED'
      ? event.payload.reason
      : event.payload.failureFingerprint;
    const derivedFailure: FailureContext = {
      taskId,
      attemptId: failure?.attemptId ?? event.eventId,
      errorClass: failure?.errorClass ?? (event.eventType === 'BLOCKED' ? 'TaskBlocked' : 'TaskFailed'),
      commandName: failure?.commandName ?? event.eventType,
      ...(failure?.exitCode === undefined ? {} : { exitCode: failure.exitCode }),
      message: failure?.message ?? message,
      evidenceIds: [...(failure?.evidenceIds ?? [])]
    };
    return this.start({
      taskId,
      failure: derivedFailure,
      actor: event.actor,
      correlationId: event.correlationId
    });
  }

  public async start(input: RecoveryRequest): Promise<RecoveryRecord> {
    const taskId = TaskIdSchema.parse(input.taskId);
    const correlation = CorrelationIdSchema.parse(input.correlationId);
    if (TaskIdSchema.parse(input.failure.taskId) !== taskId) {
      throw new Error('Recovery request task ID does not match failure task ID');
    }
    const task = await this.requireTask(taskId);
    const fingerprint = failureFingerprint(input.failure);
    const currentRecoveryId = this.options.newRecoveryId?.(task.recoveryCycles, taskId) ?? `recovery:${taskId}:cycle:${task.recoveryCycles}`;
    const priorRecord = await this.options.records.get(currentRecoveryId);
    const startFingerprint = JSON.stringify({ taskId, fingerprint, attemptId: input.failure.attemptId,
      actor: input.actor, correlationId: correlation });
    if (task.state === 'RECOVERING' && priorRecord?.startFingerprint === startFingerprint) return cloneRecord(priorRecord);
    if (task.state !== 'BLOCKED' && task.state !== 'FAILED') {
      throw new Error(`Cannot start recovery for task in ${task.state}`);
    }
    if (task.recoveryCycles >= 5) throw new Error('Maximum recovery cycles have been exhausted');

    const history = await this.options.records.list(taskId);
    const previous = history.at(-1);
    const strategy = this.selectStrategy(input.failure, previous?.fingerprint === fingerprint ? previous.plan.strategyName : undefined);
    const cycle = task.recoveryCycles + 1;
    const recoveryId = this.options.newRecoveryId?.(cycle, taskId) ?? `recovery:${taskId}:cycle:${cycle}`;
    const now = this.now();
    const recovery = transitionTask(task, { type: 'RECOVERY_STARTED', recoveryId }, {
      actor: input.actor, now, evidenceIds: [...input.failure.evidenceIds], isDeployment: task.isDeployment ?? false
    });
    const command = {
      commandId: `start-recovery:${recoveryId}`,
      type: 'START_RECOVERY' as const,
      payload: { taskId, recoveryId },
      actor: input.actor,
      issuedAt: now,
      availableAt: now,
      correlationId: correlation,
      causationId: recovery.event.eventId
    };
    const record: RecoveryRecord = {
      recoveryId, taskId, cycle, fingerprint, plan: strategy.plan(input.failure),
      state: 'STARTED', createdAt: now, evidenceIds: [...new Set(input.failure.evidenceIds)], startFingerprint
    };
    await this.options.transactionalPersistence.saveRecoveryAndAppend({
      task: recovery.task, expectedVersion: task.version, events: [recovery.event], commands: [command],
      record, idempotencyKey: `recovery-start:${recoveryId}`, requestFingerprint: startFingerprint
    });
    return cloneRecord(record);
  }

  public async complete(input: RecoveryCompletion): Promise<void> {
    const record = await this.options.records.get(input.recoveryId);
    const completionFingerprint = JSON.stringify({ recoveryId: input.recoveryId, taskId: input.taskId,
      succeeded: input.succeeded, evidenceIds: [...new Set(input.evidenceIds)].sort() });
    if (record?.completionFingerprint === completionFingerprint) return;
    if (record === null || record.taskId !== input.taskId || record.state !== 'STARTED') {
      throw new Error('Recovery completion does not identify a started recovery');
    }
    const task = await this.requireTask(TaskIdSchema.parse(input.taskId));
    if (task.state !== 'RECOVERING' || task.recoveryCycles !== record.cycle) {
      throw new Error('Task state does not match the active recovery cycle');
    }
    const evidenceIds = [...new Set([...record.evidenceIds, ...input.evidenceIds])];
    if (input.succeeded) {
      const ready = transitionTask(task, { type: 'TASK_READY' }, {
        actor: SYSTEM_ACTOR, now: this.now(), evidenceIds, isDeployment: task.isDeployment ?? false
      });
      await this.options.transactionalPersistence.saveRecoveryAndAppend({
        task: ready.task, expectedVersion: task.version, events: [ready.event], commands: [],
        record: { ...record, state: 'SUCCEEDED', evidenceIds, completionFingerprint },
        idempotencyKey: `recovery-complete:${record.recoveryId}`, requestFingerprint: completionFingerprint
      });
      return;
    }
    if (record.cycle === 5) {
      await this.escalate({
        taskId: task.id, reason: `Recovery cycle 5 failed (${record.fingerprint})`,
        recoveryId: record.recoveryId, actor: SYSTEM_ACTOR, correlationId: task.traceId, evidenceIds
      }, completionFingerprint);
      return;
    }
    const failed = transitionTask(task, { type: 'TASK_FAILED', failureFingerprint: record.fingerprint }, {
      actor: SYSTEM_ACTOR, now: this.now(), evidenceIds, isDeployment: task.isDeployment ?? false
    });
    await this.options.transactionalPersistence.saveRecoveryAndAppend({
      task: failed.task, expectedVersion: task.version, events: [failed.event], commands: [],
      record: { ...record, state: 'FAILED', evidenceIds, completionFingerprint },
      idempotencyKey: `recovery-complete:${record.recoveryId}`, requestFingerprint: completionFingerprint
    });
  }

  public async escalate(input: EscalationRequest, completionFingerprint?: string): Promise<ApprovalRecord> {
    const task = await this.requireTask(TaskIdSchema.parse(input.taskId));
    if (task.state !== 'RECOVERING' || task.recoveryCycles !== 5) {
      throw new Error('Recovery escalation is only valid after the fifth recovery cycle');
    }
    const now = this.now();
    const evidenceIds = [...new Set(input.evidenceIds ?? [])];
    const escalationReason = `${input.reason}; evidence: ${evidenceIds.join(', ') || 'none provided'}`;
    const transition = transitionTask(task, { type: 'TASK_ESCALATED', reason: escalationReason }, {
      actor: input.actor, now, evidenceIds: input.evidenceIds ?? [], isDeployment: task.isDeployment ?? false
    });
    const id = approvalId(this.options.newApprovalId?.(task.recoveryCycles, task.id) ?? `recovery-escalation:${task.id}:cycle:5`);
    const approval = ApprovalRecordSchema.parse({
      approvalId: id, subjectType: 'RECOVERY_ESCALATION', subjectId: input.recoveryId,
      reason: escalationReason,
      requestedBy: input.actor, correlationId: CorrelationIdSchema.parse(input.correlationId),
      causationId: EventIdSchema.parse(transition.event.eventId), version: 0,
      createdAt: now, updatedAt: now, state: 'PENDING', decision: null, decisionReason: null, decidedBy: null, decidedAt: null
    });
    const command = {
      commandId: `request-recovery-escalation:${id}`,
      type: 'REQUEST_APPROVAL' as const,
      payload: { subjectType: 'RECOVERY_ESCALATION' as const, subjectId: input.recoveryId, reason: approval.reason },
      actor: input.actor, issuedAt: now, availableAt: now,
      correlationId: approval.correlationId, causationId: transition.event.eventId
    };
    const record = await this.options.records.get(input.recoveryId);
    if (!record || record.taskId !== task.id || record.state !== 'STARTED') throw new Error('Escalation requires a started recovery record');
    const fingerprint = completionFingerprint ?? JSON.stringify({ recoveryId: input.recoveryId, reason: input.reason,
      evidenceIds: [...evidenceIds].sort() });
    await this.options.transactionalPersistence.saveRecoveryAndAppend({
      task: transition.task, expectedVersion: task.version, events: [transition.event], commands: [command],
      record: { ...record, state: 'ESCALATED', evidenceIds, completionFingerprint: fingerprint },
      idempotencyKey: `recovery-complete:${record.recoveryId}`, requestFingerprint: fingerprint
    });
    return approval;
  }

  private async requireTask(taskId: TaskId): Promise<Task> {
    const task = await this.options.taskRepository.get(taskId);
    if (task === null) throw new Error(`Task ${taskId} was not found`);
    return task;
  }

  private selectStrategy(failure: FailureContext, previousName?: string): RecoveryStrategy {
    const strategy = this.options.strategies.find((candidate) =>
      candidate.name !== previousName && candidate.canHandle(failure)
    );
    if (strategy === undefined) throw new Error('No recovery strategy changes the previous assumption');
    const plan = strategy.plan(failure);
    if (!plan.strategyName.trim() || !plan.changedAssumption.trim() || plan.strategyName === previousName) {
      throw new Error('Recovery strategy must declare a changed assumption');
    }
    return strategy;
  }
}
