import {
  AgentDefinitionIdSchema,
  AgentSessionIdSchema,
  TaskIdSchema,
  WorkflowIdSchema,
  type AgentDefinitionId,
  type AgentSessionId,
  type TaskId,
  type WorkflowId
} from '@aicompany/contracts';

export interface UsageRecord {
  usageId: string;
  workflowId: WorkflowId;
  taskId: TaskId;
  agentSessionId: AgentSessionId;
  agentDefinitionId: AgentDefinitionId;
  department: string;
  provider: string;
  baseUrlIdentifier: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  createdAt: Date;
}

export interface CostSummary {
  workflowId?: WorkflowId;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  byModel: Record<string, number>;
  byDepartment: Record<string, number>;
  byAgent: Record<string, number>;
}

export interface CostSink {
  recordUsage(input: UsageRecord): Promise<void>;
  getWorkflowCost(workflowId: WorkflowId): Promise<CostSummary>;
}

export type CostScope = 'task' | 'agent' | 'workflow';
export interface CostBudget { maxTokens: number; maxCostUsd: number }

export interface BudgetCheckInput {
  workflowId: WorkflowId;
  taskId: TaskId;
  branchTaskId: TaskId;
  agentDefinitionId: AgentDefinitionId;
  department: string;
  taskBudget: CostBudget;
  agentBudget: CostBudget;
  workflowBudget: CostBudget;
  projectedScope: CostScope;
  projectedInputTokens: number;
  projectedOutputTokens: number;
  projectedCostUsd: number;
}

export type BudgetDecision =
  | { kind: 'allowed' }
  | {
    kind: 'exceeded';
    scope: CostScope;
    workflowId: WorkflowId;
    taskId: TaskId;
    branchTaskId: TaskId;
    decision: 'PAUSE_BRANCH';
    reason: string;
    escalation: { type: 'COST_BUDGET_EXCEEDED'; scope: CostScope; workflowId: WorkflowId; taskId: TaskId; branchTaskId: TaskId; agentDefinitionId: AgentDefinitionId };
  };

const text = (value: string, label: string): string => {
  if (value.trim().length === 0) throw new Error(`${label} cannot be empty`);
  return value.trim();
};

const validateUsage = (input: UsageRecord): UsageRecord => {
  const record: UsageRecord = {
    ...input,
    usageId: text(input.usageId, 'usageId'),
    workflowId: WorkflowIdSchema.parse(input.workflowId),
    taskId: TaskIdSchema.parse(input.taskId),
    agentSessionId: AgentSessionIdSchema.parse(input.agentSessionId),
    agentDefinitionId: AgentDefinitionIdSchema.parse(input.agentDefinitionId),
    department: text(input.department, 'department'),
    provider: text(input.provider, 'provider'),
    baseUrlIdentifier: text(input.baseUrlIdentifier, 'baseUrlIdentifier'),
    model: text(input.model, 'model'),
    createdAt: new Date(input.createdAt)
  };
  for (const field of ['inputTokens', 'outputTokens'] as const) {
    if (!Number.isSafeInteger(record[field]) || record[field] < 0) throw new RangeError(`${field} must be a non-negative safe integer`);
  }
  if (!Number.isFinite(record.estimatedCostUsd) || record.estimatedCostUsd < 0) {
    throw new RangeError('estimatedCostUsd must be finite and non-negative');
  }
  if (Number.isNaN(record.createdAt.getTime())) throw new RangeError('createdAt must be a valid date');
  return record;
};

const usageFingerprint = (record: UsageRecord): string => JSON.stringify([
  record.usageId, record.workflowId, record.taskId, record.agentSessionId, record.agentDefinitionId,
  record.department, record.provider, record.baseUrlIdentifier, record.model, record.inputTokens,
  record.outputTokens, record.estimatedCostUsd, record.createdAt.toISOString()
]);

const validateBudget = (budget: CostBudget, scope: CostScope): void => {
  if (!Number.isSafeInteger(budget.maxTokens) || budget.maxTokens < 0) {
    throw new RangeError(`${scope} maxTokens must be a non-negative safe integer`);
  }
  if (!Number.isFinite(budget.maxCostUsd) || budget.maxCostUsd < 0) {
    throw new RangeError(`${scope} maxCostUsd must be finite and non-negative`);
  }
};

const validateProjectedUsage = (input: BudgetCheckInput): void => {
  for (const field of ['projectedInputTokens', 'projectedOutputTokens'] as const) {
    if (!Number.isSafeInteger(input[field]) || input[field] < 0) {
      throw new RangeError(`${field} must be a non-negative safe integer`);
    }
  }
  if (!Number.isFinite(input.projectedCostUsd) || input.projectedCostUsd < 0) {
    throw new RangeError('projectedCostUsd must be finite and non-negative');
  }
};

const validateProjectedScope = (scope: CostScope): CostScope => {
  if (scope !== 'task' && scope !== 'agent' && scope !== 'workflow') {
    throw new RangeError(`projectedScope must be task, agent, or workflow`);
  }
  return scope;
};

const add = (summary: CostSummary, record: UsageRecord): void => {
  summary.inputTokens += record.inputTokens;
  summary.outputTokens += record.outputTokens;
  summary.estimatedCostUsd += record.estimatedCostUsd;
  summary.byModel[record.model] = (summary.byModel[record.model] ?? 0) + record.estimatedCostUsd;
  summary.byDepartment[record.department] = (summary.byDepartment[record.department] ?? 0) + record.estimatedCostUsd;
  summary.byAgent[record.agentDefinitionId] = (summary.byAgent[record.agentDefinitionId] ?? 0) + record.estimatedCostUsd;
};

const emptySummary = (workflowId?: WorkflowId): CostSummary => ({
  ...(workflowId === undefined ? {} : { workflowId }), inputTokens: 0, outputTokens: 0,
  estimatedCostUsd: 0, byModel: Object.create(null), byDepartment: Object.create(null), byAgent: Object.create(null)
});

const cloneUsage = (record: UsageRecord): UsageRecord => ({ ...record, createdAt: new Date(record.createdAt) });
const cloneSummary = (summary: CostSummary): CostSummary => ({
  ...summary, byModel: Object.assign(Object.create(null), summary.byModel),
  byDepartment: Object.assign(Object.create(null), summary.byDepartment),
  byAgent: Object.assign(Object.create(null), summary.byAgent)
});

const usageIdOrder = (left: UsageRecord, right: UsageRecord): number =>
  left.usageId < right.usageId ? -1 : left.usageId > right.usageId ? 1 : 0;

export class InMemoryCostSink implements CostSink {
  private readonly records = new Map<string, UsageRecord>();

  public get usages(): UsageRecord[] { return this.orderedUsages().map(cloneUsage); }

  private orderedUsages(): UsageRecord[] {
    return [...this.records.values()].sort(usageIdOrder);
  }

  public async recordUsage(input: UsageRecord): Promise<void> {
    const record = validateUsage(input);
    const existing = this.records.get(record.usageId);
    if (existing !== undefined) {
      if (usageFingerprint(existing) !== usageFingerprint(record)) throw new Error(`Conflicting duplicate usage ID: ${record.usageId}`);
      return;
    }
    this.records.set(record.usageId, cloneUsage(record));
  }

  public async getWorkflowCost(workflowId: WorkflowId): Promise<CostSummary> {
    const normalized = WorkflowIdSchema.parse(workflowId);
    const summary = emptySummary(normalized);
    for (const record of this.orderedUsages()) if (record.workflowId === normalized) add(summary, record);
    return cloneSummary(summary);
  }

  public async getAggregateCost(): Promise<CostSummary> {
    const summary = emptySummary();
    for (const record of this.orderedUsages()) add(summary, record);
    return cloneSummary(summary);
  }
}

export class InMemoryCostUsage {
  private readonly sink = new InMemoryCostSink();

  public recordUsage(input: UsageRecord): Promise<void> { return this.sink.recordUsage(input); }

  public async checkBudget(input: BudgetCheckInput): Promise<BudgetDecision> {
    const taskId = TaskIdSchema.parse(input.taskId);
    const branchTaskId = TaskIdSchema.parse(input.branchTaskId);
    const workflowId = WorkflowIdSchema.parse(input.workflowId);
    const agentDefinitionId = AgentDefinitionIdSchema.parse(input.agentDefinitionId);
    const department = text(input.department, 'department');
    validateProjectedScope(input.projectedScope);
    validateBudget(input.taskBudget, 'task');
    validateBudget(input.agentBudget, 'agent');
    validateBudget(input.workflowBudget, 'workflow');
    validateProjectedUsage(input);
    const records = this.sink.usages;
    const relevant = (record: UsageRecord): boolean => record.workflowId === workflowId;
    const taskRecords = records.filter((record) => relevant(record) && record.taskId === taskId);
    const agentRecords = records.filter((record) =>
      relevant(record) && record.agentDefinitionId === agentDefinitionId && record.department === department
    );
    const workflowRecords = records.filter(relevant);
    for (const [scope, scopeRecords, budget] of [
      ['task', taskRecords, input.taskBudget], ['agent', agentRecords, input.agentBudget], ['workflow', workflowRecords, input.workflowBudget]
    ] as const) {
      const projectedTokens = input.projectedInputTokens + input.projectedOutputTokens;
      const projectedCost = input.projectedCostUsd;
      const tokens = scopeRecords.reduce((sum, record) => sum + record.inputTokens + record.outputTokens, projectedTokens);
      const cost = scopeRecords.reduce((sum, record) => sum + record.estimatedCostUsd, projectedCost);
      if (tokens > budget.maxTokens || cost > budget.maxCostUsd) {
        return {
          kind: 'exceeded', scope, workflowId, taskId, branchTaskId,
          decision: 'PAUSE_BRANCH',
          reason: `${scope} budget exceeded (${tokens}/${budget.maxTokens} tokens, $${cost}/${budget.maxCostUsd})`,
          escalation: { type: 'COST_BUDGET_EXCEEDED', scope, workflowId, taskId, branchTaskId, agentDefinitionId }
        };
      }
    }
    return { kind: 'allowed' };
  }
}

export class BudgetExceededError extends Error {
  public constructor(public readonly budgetDecision: Extract<BudgetDecision, { kind: 'exceeded' }>) {
    super(budgetDecision.reason);
    this.name = 'BudgetExceededError';
  }
}
