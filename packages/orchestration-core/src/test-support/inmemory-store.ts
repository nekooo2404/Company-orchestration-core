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
import type { EventStore, Outbox, OutboxCommand, TaskRepository } from '../ports';

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

    const parsedEvents = events.map((event) => DomainEventSchema.parse(event));

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
    return (this.streams.get(aggregateId) ?? [])
      .filter((event) => event.aggregateVersion > afterVersion)
      .map(clone);
  }

  public async hasEvent(eventId: EventId): Promise<boolean> {
    return this.eventsById.has(EventIdSchema.parse(eventId));
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
    const parsedCommand = OutboxCommandSchema.parse(command);
    const existing = this.commands.get(parsedCommand.commandId);
    if (existing !== undefined) {
      if (!sameValue(existing, parsedCommand)) {
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
    if (workerId.trim().length === 0) {
      throw new InvalidPersistenceOperationError('workerId cannot be empty');
    }

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
        claimedBy: workerId,
        claimedAt: clone(currentTime)
      };
      this.commands.set(command.commandId, claimed);
      return clone(claimed);
    });
  }

  public async markCompleted(commandId: string): Promise<void> {
    const command = this.commands.get(commandId);
    if (command === undefined) {
      throw new InvalidPersistenceOperationError(`Outbox command ${commandId} does not exist`);
    }
    if (command.completedAt !== undefined && command.completedAt !== null) {
      return;
    }
    this.commands.set(commandId, {
      ...command,
      completedAt: clone(this.now())
    });
  }
}

export {
  DuplicatePersistenceIdError,
  InvalidPersistenceOperationError,
  OptimisticConcurrencyError
};
