import { type ActorRef, type AgentDefinitionId, type CorrelationId, type TaskId, type WorkflowId } from '@aicompany/contracts';
export interface CeoCommandEnvelope {
    actor: ActorRef;
    reason: string;
    idempotencyKey: string;
    correlationId: CorrelationId;
}
export type PauseWorkflowCommand = CeoCommandEnvelope & {
    workflowId: WorkflowId;
};
export type ResumeWorkflowCommand = CeoCommandEnvelope & {
    workflowId: WorkflowId;
};
export type CancelTaskCommand = CeoCommandEnvelope & {
    taskId: TaskId;
};
export type ReassignTaskCommand = CeoCommandEnvelope & {
    taskId: TaskId;
    agentDefinitionId: AgentDefinitionId;
};
export type CeoCommand = (PauseWorkflowCommand & {
    command: 'pauseWorkflow';
}) | (ResumeWorkflowCommand & {
    command: 'resumeWorkflow';
}) | (CancelTaskCommand & {
    command: 'cancelTask';
}) | (ReassignTaskCommand & {
    command: 'reassignTask';
});
export interface CeoCommandService {
    pauseWorkflow(input: PauseWorkflowCommand): Promise<void>;
    resumeWorkflow(input: ResumeWorkflowCommand): Promise<void>;
    cancelTask(input: CancelTaskCommand): Promise<void>;
    reassignTask(input: ReassignTaskCommand): Promise<void>;
}
export interface CeoCommandExecutor {
    execute(command: CeoCommand): Promise<void>;
}
export declare class CeoAuthorizationError extends Error {
    constructor();
}
export declare class CeoCommandIdempotencyError extends Error {
    constructor();
}
export declare class InMemoryCeoCommandService implements CeoCommandService {
    private readonly options;
    private readonly operations;
    constructor(options: {
        execute: CeoCommandExecutor['execute'];
    });
    pauseWorkflow(input: PauseWorkflowCommand): Promise<void>;
    resumeWorkflow(input: ResumeWorkflowCommand): Promise<void>;
    cancelTask(input: CancelTaskCommand): Promise<void>;
    reassignTask(input: ReassignTaskCommand): Promise<void>;
    private issue;
}
//# sourceMappingURL=ceo-commands.d.ts.map