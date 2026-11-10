import { type AgentDefinitionId, type AgentSessionId, type TaskId, type WorkflowId } from '@aicompany/contracts';
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
export interface CostBudget {
    maxTokens: number;
    maxCostUsd: number;
}
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
export type BudgetDecision = {
    kind: 'allowed';
} | {
    kind: 'exceeded';
    scope: CostScope;
    workflowId: WorkflowId;
    taskId: TaskId;
    branchTaskId: TaskId;
    decision: 'PAUSE_BRANCH';
    reason: string;
    escalation: {
        type: 'COST_BUDGET_EXCEEDED';
        scope: CostScope;
        workflowId: WorkflowId;
        taskId: TaskId;
        branchTaskId: TaskId;
        agentDefinitionId: AgentDefinitionId;
    };
};
export declare class InMemoryCostSink implements CostSink {
    private readonly records;
    get usages(): UsageRecord[];
    private orderedUsages;
    recordUsage(input: UsageRecord): Promise<void>;
    getWorkflowCost(workflowId: WorkflowId): Promise<CostSummary>;
    getAggregateCost(): Promise<CostSummary>;
}
export declare class InMemoryCostUsage {
    private readonly sink;
    recordUsage(input: UsageRecord): Promise<void>;
    checkBudget(input: BudgetCheckInput): Promise<BudgetDecision>;
}
export declare class BudgetExceededError extends Error {
    readonly budgetDecision: Extract<BudgetDecision, {
        kind: 'exceeded';
    }>;
    constructor(budgetDecision: Extract<BudgetDecision, {
        kind: 'exceeded';
    }>);
}
//# sourceMappingURL=cost.d.ts.map