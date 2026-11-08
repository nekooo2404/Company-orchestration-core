import { ActorRefSchema, AgentDefinitionIdSchema, TaskIdSchema, WorkflowIdSchema, correlationId, type ActorRef, type AgentDefinitionId, type TaskId, type WorkflowId } from '@aicompany/contracts';

export interface CeoCommandService {
  pauseWorkflow(workflowId: WorkflowId, reason: string): Promise<void>;
  resumeWorkflow(workflowId: WorkflowId): Promise<void>;
  cancelTask(taskId: TaskId, reason: string): Promise<void>;
  reassignTask(taskId: TaskId, agentDefinitionId: AgentDefinitionId): Promise<void>;
}

export interface CeoCommandEnvelope {
  command: 'pauseWorkflow' | 'resumeWorkflow' | 'cancelTask' | 'reassignTask';
  targetId: string;
  actor: ActorRef;
  reason: string;
  idempotencyKey: string;
  correlationId: ReturnType<typeof correlationId>;
  agentDefinitionId?: AgentDefinitionId;
}
export interface CeoCommandExecutor { execute(command: CeoCommandEnvelope): Promise<void> }
export interface InMemoryCeoCommandOptions {
  actor: ActorRef;
  execute: CeoCommandExecutor['execute'];
  idempotency?: Map<string, Promise<void>>;
  correlationId?: CeoCommandEnvelope['correlationId'];
}

export class CeoAuthorizationError extends Error { public constructor() { super('Only the CEO may issue orchestration commands'); this.name = 'CeoAuthorizationError'; } }

export class InMemoryCeoCommandService implements CeoCommandService {
  private readonly completed: Map<string, Promise<void>>;
  private readonly actor: ActorRef;
  private readonly correlation: CeoCommandEnvelope['correlationId'];
  public constructor(private readonly options: InMemoryCeoCommandOptions) {
    this.actor = ActorRefSchema.parse(options.actor);
    this.completed = options.idempotency ?? new Map();
    this.correlation = options.correlationId ?? correlationId('ceo-command');
  }
  public async pauseWorkflow(id: WorkflowId, reason: string): Promise<void> { await this.issue('pauseWorkflow', WorkflowIdSchema.parse(id), reason); }
  public async resumeWorkflow(id: WorkflowId): Promise<void> { await this.issue('resumeWorkflow', WorkflowIdSchema.parse(id), 'Resume workflow'); }
  public async cancelTask(id: TaskId, reason: string): Promise<void> { await this.issue('cancelTask', TaskIdSchema.parse(id), reason); }
  public async reassignTask(id: TaskId, agent: AgentDefinitionId): Promise<void> { await this.issue('reassignTask', TaskIdSchema.parse(id), 'Reassign task', AgentDefinitionIdSchema.parse(agent)); }

  private async issue(command: CeoCommandEnvelope['command'], targetId: string, reason: string, agentDefinitionId?: AgentDefinitionId): Promise<void> {
    if (this.actor.kind !== 'CEO') throw new CeoAuthorizationError();
    const actualReason = reason;
    if (!actualReason.trim()) throw new Error('CEO command reason is required');
    const key = `ceo:${command}:${targetId}:${actualReason.trim()}:${agentDefinitionId ?? ''}`;
    const existing = this.completed.get(key);
    if (existing) return existing;
    const pending = this.options.execute({ command, targetId, actor: this.actor, reason: actualReason.trim(), idempotencyKey: key, correlationId: this.correlation, ...(agentDefinitionId ? { agentDefinitionId } : {}) });
    this.completed.set(key, pending);
    try { await pending; } catch (error) { this.completed.delete(key); throw error; }
  }
}
