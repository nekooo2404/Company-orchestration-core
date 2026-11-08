import type {
  DomainEvent,
  EventId,
  OutboxCommand as ContractOutboxCommand,
  ApprovalRecord,
  Task,
  AgentSessionId
} from '@aicompany/contracts';
import type { RecoveryRecord } from './recovery.js';
export type { TaskRepository } from './repository.js';

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

export interface SaveApprovalDecisionAndTaskInput {
  approval: ApprovalRecord;
  expectedApprovalVersion: number;
  approvalEvent: DomainEvent;
  task?: Task;
  expectedTaskVersion?: number;
  taskEvent?: DomainEvent;
  commands: readonly OutboxCommand[];
  idempotencyKey: string;
  requestFingerprint: string;
}

export interface SaveApprovalRequestInput {
  approval: ApprovalRecord;
  requestEvent: DomainEvent;
  command: OutboxCommand;
  idempotencyKey: string;
  requestFingerprint: string;
}

export interface TransactionalPersistence {
  saveTaskAndAppend(input: SaveTaskAndAppendInput): Promise<void>;
  saveRecoveryAndAppend(input: SaveTaskAndAppendInput & { record: RecoveryRecord; idempotencyKey: string; requestFingerprint: string }): Promise<void>;
  saveApprovalRequest(input: SaveApprovalRequestInput): Promise<ApprovalRecord>;
  saveApprovalDecisionAndTask(input: SaveApprovalDecisionAndTaskInput): Promise<void>;
  claimDispatch(input: DispatchClaimRequest): Promise<DispatchClaim | null>;
  getDispatchClaim(taskId: Task['id']): Promise<DispatchClaim | null>;
  beginDispatchCleanup(taskId: Task['id'], workerId: string, leaseId: string, generation: number): Promise<boolean>;
  abortDispatchCleanup(taskId: Task['id'], workerId: string, leaseId: string, generation: number): Promise<void>;
  releaseDispatch(taskId: Task['id'], workerId: string, leaseId: string): Promise<boolean>;
}

export interface DispatchClaimRequest {
  taskId: Task['id'];
  taskVersion: number;
  taskState: Task['state'];
  workerId: string;
  agentDefinitionId: NonNullable<Task['ownerAgentDefinitionId']>;
  sessionId: AgentSessionId;
  leaseId: string;
  now: Date;
  expiresAt: Date;
  maxConcurrency?: number;
}

export type DispatchClaim = DispatchClaimRequest & { generation: number; cleanupInProgress: boolean };

export interface DispatchClaimStore {
  claimDispatch(input: DispatchClaimRequest): Promise<DispatchClaim | null>;
  getDispatchClaim(taskId: Task['id']): Promise<DispatchClaim | null>;
  beginDispatchCleanup(taskId: Task['id'], workerId: string, leaseId: string, generation: number): Promise<boolean>;
  abortDispatchCleanup(taskId: Task['id'], workerId: string, leaseId: string, generation: number): Promise<void>;
  releaseDispatch(taskId: Task['id'], workerId: string, leaseId: string): Promise<boolean>;
}

export interface Outbox {
  enqueue(command: OutboxCommand): Promise<void>;
  claim(limit: number, workerId: string): Promise<OutboxCommand[]>;
  markCompleted(commandId: string): Promise<void>;
}
