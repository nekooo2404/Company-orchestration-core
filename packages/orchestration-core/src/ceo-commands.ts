import {
  ActorRefSchema,
  AgentDefinitionIdSchema,
  CorrelationIdSchema,
  TaskIdSchema,
  WorkflowIdSchema,
  type ActorRef,
  type AgentDefinitionId,
  type CorrelationId,
  type TaskId,
  type WorkflowId
} from '@aicompany/contracts';

export interface CeoCommandEnvelope {
  actor: ActorRef;
  reason: string;
  idempotencyKey: string;
  correlationId: CorrelationId;
}

export type PauseWorkflowCommand = CeoCommandEnvelope & { workflowId: WorkflowId };
export type ResumeWorkflowCommand = CeoCommandEnvelope & { workflowId: WorkflowId };
export type CancelTaskCommand = CeoCommandEnvelope & { taskId: TaskId };
export type ReassignTaskCommand = CeoCommandEnvelope & {
  taskId: TaskId;
  agentDefinitionId: AgentDefinitionId;
};

export type CeoCommand =
  | (PauseWorkflowCommand & { command: 'pauseWorkflow' })
  | (ResumeWorkflowCommand & { command: 'resumeWorkflow' })
  | (CancelTaskCommand & { command: 'cancelTask' })
  | (ReassignTaskCommand & { command: 'reassignTask' });

export interface CeoCommandService {
  pauseWorkflow(input: PauseWorkflowCommand): Promise<void>;
  resumeWorkflow(input: ResumeWorkflowCommand): Promise<void>;
  cancelTask(input: CancelTaskCommand): Promise<void>;
  reassignTask(input: ReassignTaskCommand): Promise<void>;
}

export interface CeoCommandExecutor {
  execute(command: CeoCommand): Promise<void>;
}

export class CeoAuthorizationError extends Error {
  public constructor() {
    super('Only the CEO may issue orchestration commands');
    this.name = 'CeoAuthorizationError';
  }
}

export class CeoCommandIdempotencyError extends Error {
  public constructor() {
    super('Idempotency key was reused with different CEO command data');
    this.name = 'CeoCommandIdempotencyError';
  }
}

export class InMemoryCeoCommandService implements CeoCommandService {
  private readonly operations = new Map<string, { fingerprint: string; result: Promise<void> }>();

  public constructor(private readonly options: { execute: CeoCommandExecutor['execute'] }) {}

  public async pauseWorkflow(input: PauseWorkflowCommand): Promise<void> {
    await this.issue({ ...input, workflowId: WorkflowIdSchema.parse(input.workflowId), command: 'pauseWorkflow' });
  }

  public async resumeWorkflow(input: ResumeWorkflowCommand): Promise<void> {
    await this.issue({ ...input, workflowId: WorkflowIdSchema.parse(input.workflowId), command: 'resumeWorkflow' });
  }

  public async cancelTask(input: CancelTaskCommand): Promise<void> {
    await this.issue({ ...input, taskId: TaskIdSchema.parse(input.taskId), command: 'cancelTask' });
  }

  public async reassignTask(input: ReassignTaskCommand): Promise<void> {
    await this.issue({
      ...input,
      taskId: TaskIdSchema.parse(input.taskId),
      agentDefinitionId: AgentDefinitionIdSchema.parse(input.agentDefinitionId),
      command: 'reassignTask'
    });
  }

  private async issue(command: CeoCommand): Promise<void> {
    const actor = ActorRefSchema.parse(command.actor);
    CorrelationIdSchema.parse(command.correlationId);
    const reason = command.reason.trim();
    const idempotencyKey = command.idempotencyKey.trim();
    if (actor.kind !== 'CEO') throw new CeoAuthorizationError();
    if (!reason || !idempotencyKey) throw new Error('CEO command reason and idempotency key are required');

    const normalized = { ...command, actor, reason, idempotencyKey };
    const fingerprint = JSON.stringify(normalized);
    const prior = this.operations.get(idempotencyKey);
    if (prior !== undefined) {
      if (prior.fingerprint !== fingerprint) throw new CeoCommandIdempotencyError();
      return prior.result;
    }

    const result = Promise.resolve().then(() => this.options.execute(normalized));
    this.operations.set(idempotencyKey, { fingerprint, result });
    try {
      await result;
    } catch (error) {
      this.operations.delete(idempotencyKey);
      throw error;
    }
  }
}
