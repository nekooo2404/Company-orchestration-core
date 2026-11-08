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
  claimDispatch(input: DispatchClaimRequest): Promise<DispatchClaim | null>;
  releaseDispatch(taskId: Task['id'], workerId: string, leaseId: string): Promise<boolean>;
}

export interface DispatchClaimRequest {
  taskId: Task['id'];
  workerId: string;
  agentDefinitionId: NonNullable<Task['ownerAgentDefinitionId']>;
  leaseId: string;
  now: Date;
  expiresAt: Date;
}

export interface DispatchClaim extends DispatchClaimRequest {
  sessionId: string | null;
}

export interface DispatchClaimStore {
  claimDispatch(input: DispatchClaimRequest): Promise<DispatchClaim | null>;
  releaseDispatch(taskId: Task['id'], workerId: string, leaseId: string): Promise<boolean>;
}

export interface Outbox {
  enqueue(command: OutboxCommand): Promise<void>;
  claim(limit: number, workerId: string): Promise<OutboxCommand[]>;
  markCompleted(commandId: string): Promise<void>;
}
