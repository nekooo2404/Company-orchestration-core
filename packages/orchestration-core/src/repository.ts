import type { Task, TaskId, WorkflowId } from '@aicompany/contracts';

export class OptimisticConcurrencyError extends Error {
  public readonly expectedVersion: number;
  public readonly actualVersion: number;

  public constructor(
    aggregateId: string,
    expectedVersion: number,
    actualVersion: number
  ) {
    super(
      `Optimistic concurrency conflict for ${aggregateId}: expected version ${expectedVersion}, actual version ${actualVersion}`
    );
    this.name = 'OptimisticConcurrencyError';
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class DuplicatePersistenceIdError extends Error {
  public constructor(kind: string, id: string) {
    super(`Duplicate ${kind} with ID ${id} has different data`);
    this.name = 'DuplicatePersistenceIdError';
  }
}

export class InvalidPersistenceOperationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'InvalidPersistenceOperationError';
  }
}

export interface TaskRepository {
  get(taskId: TaskId): Promise<Task | null>;
  listByWorkflow(workflowId: WorkflowId): Promise<Task[]>;
  countActiveByAgent(agentId: NonNullable<Task['ownerAgentDefinitionId']>): Promise<number>;
  save(task: Task, expectedVersion: number): Promise<void>;
}
