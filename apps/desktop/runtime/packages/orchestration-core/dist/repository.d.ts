import type { Task, TaskId, WorkflowId } from '@aicompany/contracts';
export declare class OptimisticConcurrencyError extends Error {
    readonly expectedVersion: number;
    readonly actualVersion: number;
    constructor(aggregateId: string, expectedVersion: number, actualVersion: number);
}
export declare class DuplicatePersistenceIdError extends Error {
    constructor(kind: string, id: string);
}
export declare class InvalidPersistenceOperationError extends Error {
    constructor(message: string);
}
export interface TaskRepository {
    get(taskId: TaskId): Promise<Task | null>;
    listByWorkflow(workflowId: WorkflowId): Promise<Task[]>;
    countActiveByAgent(agentId: NonNullable<Task['ownerAgentDefinitionId']>): Promise<number>;
    save(task: Task, expectedVersion: number): Promise<void>;
}
//# sourceMappingURL=repository.d.ts.map