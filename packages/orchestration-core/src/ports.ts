import type {
  DomainEvent,
  EventId,
  OutboxCommand as ContractOutboxCommand,
  Task
} from '@aicompany/contracts';
export type { TaskRepository } from './repository';

export interface EventStore {
  append(events: readonly DomainEvent[], expectedVersion: number): Promise<void>;
  readStream(aggregateId: string, afterVersion?: number): Promise<DomainEvent[]>;
  hasEvent(eventId: EventId): Promise<boolean>;
}

export type OutboxCommand = ContractOutboxCommand;

export interface SaveTaskAndAppendInput {
  task: Task;
  expectedVersion: number;
  events: readonly DomainEvent[];
  commands: readonly OutboxCommand[];
}

export interface TransactionalPersistence {
  saveTaskAndAppend(input: SaveTaskAndAppendInput): Promise<void>;
}

export interface Outbox {
  enqueue(command: OutboxCommand): Promise<void>;
  claim(limit: number, workerId: string): Promise<OutboxCommand[]>;
  markCompleted(commandId: string): Promise<void>;
}
