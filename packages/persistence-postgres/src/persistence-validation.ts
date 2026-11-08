import {
  DomainEventSchema,
  OutboxCommandSchema,
  TaskSchema,
  type DomainEvent,
  type EventId,
  type OutboxCommand,
  type Task,
  type TaskId,
  type WorkflowId
} from '@aicompany/contracts';
import { InvalidPersistenceOperationError } from '@aicompany/orchestration-core';

export const canonicalId = (value: string, name: string): string => {
  if (typeof value !== 'string') {
    throw new InvalidPersistenceOperationError(`${name} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new InvalidPersistenceOperationError(`${name} cannot be empty`);
  }
  return normalized;
};

export const parseTaskId = (value: string): TaskId => canonicalId(value, 'taskId') as TaskId;

export const parseWorkflowId = (value: string): WorkflowId =>
  canonicalId(value, 'workflowId') as WorkflowId;

export const parseEventId = (value: EventId): EventId =>
  canonicalId(value, 'eventId') as EventId;

export const parseDomainEvent = (event: DomainEvent): DomainEvent => {
  const parsed = DomainEventSchema.parse(event);
  return {
    ...parsed,
    aggregateId: canonicalId(parsed.aggregateId, 'aggregateId')
  };
};

export const parseTask = (task: Task): Task => TaskSchema.parse(task);

export const parseOutboxCommand = (command: unknown): OutboxCommand => {
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

export const sameValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));

export const sameOutboxCommandIdentity = (
  left: OutboxCommand,
  right: OutboxCommand
): boolean => sameValue(
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

export const assertVersion = (version: number, name: string): void => {
  if (!Number.isInteger(version) || version < 0) {
    throw new InvalidPersistenceOperationError(`${name} must be a non-negative integer`);
  }
};

export const assertReadVersion = (version: number, name: string): void => {
  if (!Number.isInteger(version) || version < -1) {
    throw new InvalidPersistenceOperationError(`${name} must be an integer greater than or equal to -1`);
  }
};
