import {
  DomainEventSchema,
  EventIdSchema,
  OutboxCommandSchema,
  TaskIdSchema,
  TaskSchema,
  WorkflowIdSchema,
  type DomainEvent,
  type EventId,
  type Task,
  type TaskId,
  type WorkflowId
} from '@aicompany/contracts';
import {
  DuplicatePersistenceIdError,
  InvalidPersistenceOperationError,
  OptimisticConcurrencyError
} from '../repository';
import type { DispatchClaim, DispatchClaimRequest, DispatchClaimStore, EventStore, Outbox, OutboxCommand, SaveApprovalDecisionAndTaskInput, SaveTaskAndAppendInput, TaskRepository, TransactionalPersistence } from '../ports';
import type { InMemoryApprovalStore } from '../approvals';

const clone = <T>(value: T): T => globalThis.structuredClone(value);

const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)])
    );
  }
  return value;
};

const sameValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));

const canonicalId = (value: string, name: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidPersistenceOperationError(`${name} cannot be empty`);
  }
  return value.trim();
};

const parseDomainEvent = (event: DomainEvent): DomainEvent => {
  const parsed = DomainEventSchema.parse(event);
  return { ...parsed, aggregateId: canonicalId(parsed.aggregateId, 'aggregateId') };
};

const parseOutboxCommand = (command: OutboxCommand): OutboxCommand => {
  const parsed = OutboxCommandSchema.parse(command);
  const hasClaimedBy = parsed.claimedBy !== undefined && parsed.claimedBy !== null;
  const hasClaimedAt = parsed.claimedAt !== undefined && parsed.claimedAt !== null;
  if (hasClaimedBy !== hasClaimedAt) {
    throw new InvalidPersistenceOperationError(
      'claimedBy and claimedAt must be provided together'
    );
  }
  return {
    ...parsed,
    commandId: canonicalId(parsed.commandId, 'commandId'),
    ...(hasClaimedBy ? { claimedBy: canonicalId(parsed.claimedBy!, 'claimedBy') } : {})
  };
};

const sameOutboxCommandIdentity = (left: OutboxCommand, right: OutboxCommand): boolean =>
  sameValue(
    {
      commandId: left.commandId,
      type: left.type,
      payload: left.payload,
      actor: left.actor,
      issuedAt: left.issuedAt,
      availableAt: left.availableAt,
      correlationId: left.correlationId,
      causationId: left.causationId
    },
    {
      commandId: right.commandId,
      type: right.type,
      payload: right.payload,
      actor: right.actor,
      issuedAt: right.issuedAt,
      availableAt: right.availableAt,
      correlationId: right.correlationId,
      causationId: right.causationId
    }
  );

const assertVersion = (version: number, name: string): void => {
  if (!Number.isInteger(version) || version < 0) {
    throw new InvalidPersistenceOperationError(`${name} must be a non-negative integer`);
  }
};

export class InMemoryEventStore implements EventStore {
  private readonly streams = new Map<string, DomainEvent[]>();
  private readonly eventsById = new Map<string, DomainEvent>();

  public async append(events: readonly DomainEvent[], expectedVersion: number): Promise<void> {
    assertVersion(expectedVersion, 'expectedVersion');
    if (events.length === 0) {
      return;
    }

    const parsedEvents = events.map(parseDomainEvent);

    const aggregateId = parsedEvents[0].aggregateId;
    const seenIds = new Set<string>();
    let existingCount = 0;

    for (const event of parsedEvents) {
      if (event.aggregateId !== aggregateId) {
        throw new InvalidPersistenceOperationError('An event append must target one aggregate');
      }
      if (seenIds.has(event.eventId)) {
        throw new DuplicatePersistenceIdError('event', event.eventId);
      }
      seenIds.add(event.eventId);

      const existing = this.eventsById.get(event.eventId);
      if (existing !== undefined) {
        existingCount += 1;
        if (!sameValue(existing, event)) {
          throw new DuplicatePersistenceIdError('event', event.eventId);
        }
      }
    }

    if (existingCount === parsedEvents.length) {
      return;
    }
    if (existingCount > 0) {
      throw new InvalidPersistenceOperationError('An append cannot mix stored and new events');
    }

    const stream = this.streams.get(aggregateId) ?? [];
    const actualVersion = stream.at(-1)?.aggregateVersion ?? 0;
    if (actualVersion !== expectedVersion) {
      throw new OptimisticConcurrencyError(aggregateId, expectedVersion, actualVersion);
    }

    parsedEvents.forEach((event, index) => {
      const expectedEventVersion = expectedVersion + index + 1;
      if (event.aggregateVersion !== expectedEventVersion) {
        throw new InvalidPersistenceOperationError(
          `Event ${event.eventId} must have aggregate version ${expectedEventVersion}`
        );
      }
    });

    const storedEvents = parsedEvents.map(clone);
    stream.push(...storedEvents);
    this.streams.set(aggregateId, stream);
    for (const event of storedEvents) {
      this.eventsById.set(event.eventId, event);
    }
  }

  public async readStream(aggregateId: string, afterVersion = 0): Promise<DomainEvent[]> {
    assertVersion(afterVersion, 'afterVersion');
    const canonicalAggregateId = canonicalId(aggregateId, 'aggregateId');
    return (this.streams.get(canonicalAggregateId) ?? [])
      .filter((event) => event.aggregateVersion > afterVersion)
      .map(clone);
  }

  public async hasEvent(eventId: EventId): Promise<boolean> {
    return this.eventsById.has(EventIdSchema.parse(eventId));
  }

  public snapshot(): { streams: Array<[string, DomainEvent[]]>; eventsById: Array<[string, DomainEvent]> } {
    return clone({ streams: [...this.streams.entries()], eventsById: [...this.eventsById.entries()] });
  }

  public restore(snapshot: { streams: Array<[string, DomainEvent[]]>; eventsById: Array<[string, DomainEvent]> }): void {
    this.streams.clear();
    this.eventsById.clear();
    for (const [aggregateId, events] of snapshot.streams) this.streams.set(aggregateId, clone(events));
    for (const [eventId, event] of snapshot.eventsById) this.eventsById.set(eventId, clone(event));
  }
}

export class InMemoryDispatchClaimStore implements DispatchClaimStore {
  private readonly claims = new Map<string, DispatchClaim>();

  public constructor(private readonly tasks?: TaskRepository) {}

  public async claimDispatch(input: DispatchClaimRequest): Promise<DispatchClaim | null> {
    const workerId = canonicalId(input.workerId, 'workerId');
    const task = await this.tasks?.get(input.taskId);
    if (this.tasks !== undefined && (task === null || task?.state !== 'READY' || task.version !== input.taskVersion || input.taskState !== 'READY')) return null;
    const existing = this.claims.get(input.taskId);
    if (existing !== undefined && existing.expiresAt > input.now) {
      return null;
    }
    if (
      existing !== undefined &&
      (existing.agentDefinitionId !== input.agentDefinitionId || existing.sessionId !== input.sessionId)
    ) return null;
    const claim: DispatchClaim = existing === undefined
      ? { ...clone(input), workerId }
      : { ...clone(existing), workerId, expiresAt: clone(input.expiresAt), taskVersion: input.taskVersion, taskState: input.taskState };
    this.claims.set(input.taskId, claim);
    return clone(claim);
  }

  public async getDispatchClaim(taskId: TaskId): Promise<DispatchClaim | null> {
    const claim = this.claims.get(TaskIdSchema.parse(taskId));
    return claim === undefined ? null : clone(claim);
  }

  public async releaseDispatch(taskId: TaskId, workerId: string, leaseId: string): Promise<boolean> {
    const claim = this.claims.get(taskId);
    if (claim === undefined || claim.workerId !== canonicalId(workerId, 'workerId') || claim.leaseId !== leaseId) {
      return false;
    }
    this.claims.delete(taskId);
    return true;
  }
}

export class InMemoryTransactionalPersistence implements TransactionalPersistence {
  public constructor(
    private readonly persistence: Pick<TransactionalPersistence, 'saveTaskAndAppend'>,
    private readonly claims: DispatchClaimStore
  ) {}

  public saveTaskAndAppend(input: SaveTaskAndAppendInput): Promise<void> {
    return this.persistence.saveTaskAndAppend(input);
  }

  public async saveApprovalDecisionAndTask(input: SaveApprovalDecisionAndTaskInput): Promise<void> {
    void input;
    throw new InvalidPersistenceOperationError('Atomic approval persistence is not configured');
  }

  public claimDispatch(input: DispatchClaimRequest): Promise<DispatchClaim | null> {
    return this.claims.claimDispatch(input);
  }

  public releaseDispatch(taskId: TaskId, workerId: string, leaseId: string): Promise<boolean> {
    return this.claims.releaseDispatch(taskId, workerId, leaseId);
  }
}

export class InMemoryTaskRepository implements TaskRepository {
  private readonly tasks = new Map<string, Task>();

  public async get(taskId: TaskId): Promise<Task | null> {
    const task = this.tasks.get(TaskIdSchema.parse(taskId));
    return task === undefined ? null : clone(task);
  }

  public async listByWorkflow(workflowId: WorkflowId): Promise<Task[]> {
    const parsedWorkflowId = WorkflowIdSchema.parse(workflowId);
    return [...this.tasks.values()]
      .filter((task) => task.workflowId === parsedWorkflowId)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(clone);
  }

  public async save(task: Task, expectedVersion: number): Promise<void> {
    assertVersion(expectedVersion, 'expectedVersion');
    const parsedTask = TaskSchema.parse(task);
    const existing = this.tasks.get(parsedTask.id);
    if (existing === undefined) {
      if (expectedVersion !== 0 || parsedTask.version !== 0) {
        throw new OptimisticConcurrencyError(parsedTask.id, expectedVersion, 0);
      }
      this.tasks.set(parsedTask.id, clone(parsedTask));
      return;
    }

    if (existing.version !== expectedVersion) {
      throw new OptimisticConcurrencyError(task.id, expectedVersion, existing.version);
    }
    if (parsedTask.version !== expectedVersion + 1) {
      throw new InvalidPersistenceOperationError(
        `Task ${parsedTask.id} must have version ${expectedVersion + 1}`
      );
    }
    this.tasks.set(parsedTask.id, clone(parsedTask));
  }

  public snapshot(taskId: TaskId): Task | null { const task = this.tasks.get(taskId); return task ? clone(task) : null; }
  public restore(taskId: TaskId, task: Task | null): void { if (task) this.tasks.set(taskId, clone(task)); else this.tasks.delete(taskId); }
}

export interface InMemoryOutboxOptions {
  now?: () => Date;
  leaseDurationMs?: number;
}

export class InMemoryOutbox implements Outbox {
  private readonly commands = new Map<string, OutboxCommand>();
  private readonly now: () => Date;
  private readonly leaseDurationMs: number;

  public constructor(options: InMemoryOutboxOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.leaseDurationMs = options.leaseDurationMs ?? 5 * 60 * 1000;
    if (!Number.isFinite(this.leaseDurationMs) || this.leaseDurationMs < 0) {
      throw new InvalidPersistenceOperationError('leaseDurationMs must be a non-negative number');
    }
  }

  public async enqueue(command: OutboxCommand): Promise<void> {
    const parsedCommand = parseOutboxCommand(command);
    const existing = this.commands.get(parsedCommand.commandId);
    if (existing !== undefined) {
      if (!sameOutboxCommandIdentity(existing, parsedCommand)) {
        throw new DuplicatePersistenceIdError('outbox command', parsedCommand.commandId);
      }
      return;
    }
    this.commands.set(parsedCommand.commandId, clone(parsedCommand));
  }

  public async claim(limit: number, workerId: string): Promise<OutboxCommand[]> {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new InvalidPersistenceOperationError('limit must be a non-negative integer');
    }
    const canonicalWorkerId = canonicalId(workerId, 'workerId');

    const currentTime = this.now();
    const staleBefore = currentTime.getTime() - this.leaseDurationMs;
    const candidates = [...this.commands.values()]
      .filter((command) => {
        if (command.completedAt !== undefined && command.completedAt !== null) {
          return false;
        }
        if (command.availableAt.getTime() > currentTime.getTime()) {
          return false;
        }
        if (command.claimedBy === undefined || command.claimedBy === null) {
          return true;
        }
        return command.claimedAt !== undefined &&
          command.claimedAt !== null &&
          command.claimedAt.getTime() <= staleBefore;
      })
      .sort((left, right) =>
        left.availableAt.getTime() - right.availableAt.getTime() ||
        left.commandId.localeCompare(right.commandId)
      )
      .slice(0, limit);

    return candidates.map((command) => {
      const claimed = {
        ...command,
        claimedBy: canonicalWorkerId,
        claimedAt: clone(currentTime)
      };
      this.commands.set(command.commandId, claimed);
      return clone(claimed);
    });
  }

  public async markCompleted(commandId: string): Promise<void> {
    const canonicalCommandId = canonicalId(commandId, 'commandId');
    const command = this.commands.get(canonicalCommandId);
    if (command === undefined) {
      throw new InvalidPersistenceOperationError(
        `Outbox command ${canonicalCommandId} does not exist`
      );
    }
    if (command.completedAt !== undefined && command.completedAt !== null) {
      return;
    }
    this.commands.set(canonicalCommandId, {
      ...command,
      completedAt: clone(this.now())
    });
  }

  public snapshot(): Map<string, OutboxCommand> {
    return clone(this.commands);
  }

  public restore(snapshot: Map<string, OutboxCommand>): void {
    this.commands.clear();
    for (const [commandId, command] of snapshot.entries()) this.commands.set(commandId, clone(command));
  }
}

export type InMemoryApprovalFailurePoint =
  | 'after-approval'
  | 'after-task'
  | 'after-approval-event'
  | 'after-task-event'
  | 'after-outbox';

export interface InMemoryApprovalTransactionalPersistenceOptions {
  tasks: InMemoryTaskRepository;
  events: InMemoryEventStore;
  outbox: InMemoryOutbox;
  approvals: InMemoryApprovalStore;
  claims?: DispatchClaimStore;
  failAfter?: InMemoryApprovalFailurePoint;
}

export class InMemoryApprovalTransactionalPersistence implements TransactionalPersistence {
  private readonly claims: DispatchClaimStore;
  private readonly operations = new Map<string, string>();

  public constructor(private readonly options: InMemoryApprovalTransactionalPersistenceOptions) {
    this.claims = options.claims ?? new InMemoryDispatchClaimStore(options.tasks);
  }

  public async saveTaskAndAppend(input: SaveTaskAndAppendInput): Promise<void> {
    await this.options.tasks.save(input.task, input.expectedVersion);
    await this.options.events.append(input.events, input.expectedVersion);
    for (const command of input.commands) await this.options.outbox.enqueue(command);
  }

  public async saveApprovalDecisionAndTask(input: SaveApprovalDecisionAndTaskInput): Promise<void> {
    const priorFingerprint = this.operations.get(input.idempotencyKey);
    if (priorFingerprint !== undefined) {
      if (priorFingerprint !== input.requestFingerprint) {
        throw new InvalidPersistenceOperationError('Atomic approval idempotency key was reused with different data');
      }
      return;
    }
    const taskProvided = input.task !== undefined || input.taskEvent !== undefined || input.expectedTaskVersion !== undefined;
    if (taskProvided !== (input.task !== undefined && input.taskEvent !== undefined && input.expectedTaskVersion !== undefined)) {
      throw new InvalidPersistenceOperationError('Atomic approval task fields must be provided together');
    }

    const approvalSnapshot = this.options.approvals.snapshot();
    const eventSnapshot = this.options.events.snapshot();
    const outboxSnapshot = this.options.outbox.snapshot();
    const taskSnapshot = input.task === undefined ? null : this.options.tasks.snapshot(input.task.id);
    try {
      await this.options.approvals.commitDecision(
        input.approval,
        input.expectedApprovalVersion,
        input.approvalEvent,
        input.idempotencyKey,
        input.requestFingerprint
      );
      this.failIf('after-approval');

      if (input.task !== undefined && input.taskEvent !== undefined && input.expectedTaskVersion !== undefined) {
        await this.options.tasks.save(input.task, input.expectedTaskVersion);
        this.failIf('after-task');
      }
      await this.options.events.append([input.approvalEvent], input.expectedApprovalVersion);
      this.failIf('after-approval-event');
      if (input.taskEvent !== undefined && input.expectedTaskVersion !== undefined) {
        await this.options.events.append([input.taskEvent], input.expectedTaskVersion);
        this.failIf('after-task-event');
      }
      for (const command of input.commands) await this.options.outbox.enqueue(command);
      this.failIf('after-outbox');
      this.operations.set(input.idempotencyKey, input.requestFingerprint);
    } catch (error) {
      this.options.approvals.restore(approvalSnapshot);
      this.options.events.restore(eventSnapshot);
      this.options.outbox.restore(outboxSnapshot);
      if (input.task !== undefined) this.options.tasks.restore(input.task.id, taskSnapshot);
      throw error;
    }
  }

  public claimDispatch(input: DispatchClaimRequest): Promise<DispatchClaim | null> {
    return this.claims.claimDispatch(input);
  }

  public releaseDispatch(taskId: TaskId, workerId: string, leaseId: string): Promise<boolean> {
    return this.claims.releaseDispatch(taskId, workerId, leaseId);
  }

  private failIf(point: InMemoryApprovalFailurePoint): void {
    if (this.options.failAfter === point) throw new Error(`Injected atomic approval failure at ${point}`);
  }
}

export {
  DuplicatePersistenceIdError,
  InvalidPersistenceOperationError,
  OptimisticConcurrencyError
};
