import { describe, expect, it } from 'vitest';
import { agentDefinitionId, agentSessionId, taskId, workflowId } from '@aicompany/contracts';
import {
  BudgetExceededError,
  InMemoryCostSink,
  InMemoryCostUsage,
  type BudgetCheckInput,
  type UsageRecord
} from './cost';

const usage = (overrides: Partial<UsageRecord> = {}): UsageRecord => ({
  usageId: 'usage-1', workflowId: workflowId('workflow-1'), taskId: taskId('task-1'),
  agentSessionId: agentSessionId('session-1'), agentDefinitionId: agentDefinitionId('agent-1'),
  department: 'engineering', provider: 'provider-a', baseUrlIdentifier: 'primary', model: 'model-a',
  inputTokens: 10, outputTokens: 5, estimatedCostUsd: 0.25, createdAt: new Date('2026-11-08T00:00:00Z'),
  ...overrides
});

describe('cost accounting', () => {
  it('records token, model, provider, endpoint, task, agent and department usage', async () => {
    const sink = new InMemoryCostSink();
    await sink.recordUsage(usage());
    expect(await sink.getWorkflowCost(workflowId('workflow-1'))).toEqual({
      workflowId: 'workflow-1', inputTokens: 10, outputTokens: 5, estimatedCostUsd: 0.25,
      byModel: { 'model-a': 0.25 }, byDepartment: { engineering: 0.25 }, byAgent: { 'agent-1': 0.25 }
    });
    expect(sink.usages[0]).toMatchObject({ provider: 'provider-a', baseUrlIdentifier: 'primary', taskId: 'task-1' });
  });

  it('is idempotent for identical usage and rejects conflicting duplicate IDs', async () => {
    const sink = new InMemoryCostSink();
    await sink.recordUsage(usage());
    await sink.recordUsage(usage());
    expect(sink.usages).toHaveLength(1);
    await expect(sink.recordUsage(usage({ estimatedCostUsd: 0.5 }))).rejects.toThrow(/duplicate usage/i);
    const reordered = Object.fromEntries(Object.entries(usage()).reverse()) as UsageRecord;
    await expect(sink.recordUsage(reordered)).resolves.toBeUndefined();
    expect(sink.usages).toHaveLength(1);
  });

  it('rejects negative, non-finite and fractional token usage', async () => {
    const sink = new InMemoryCostSink();
    await expect(sink.recordUsage(usage({ inputTokens: -1 }))).rejects.toThrow(/inputTokens/i);
    await expect(sink.recordUsage(usage({ outputTokens: 0.5 }))).rejects.toThrow(/outputTokens/i);
    await expect(sink.recordUsage(usage({ estimatedCostUsd: Number.NaN }))).rejects.toThrow(/estimatedCostUsd/i);
    expect(sink.usages).toHaveLength(0);
  });

  it('aggregates independently by workflow, model, department and agent', async () => {
    const sink = new InMemoryCostSink();
    await sink.recordUsage(usage());
    await sink.recordUsage(usage({ usageId: 'usage-2', workflowId: workflowId('workflow-2'),
      department: 'design', agentDefinitionId: agentDefinitionId('agent-2'), model: 'model-b',
      inputTokens: 20, outputTokens: 4, estimatedCostUsd: 0.75 }));
    expect(await sink.getWorkflowCost(workflowId('workflow-1'))).toMatchObject({ estimatedCostUsd: 0.25, byModel: { 'model-a': 0.25 } });
    expect(await sink.getWorkflowCost(workflowId('workflow-2'))).toMatchObject({ estimatedCostUsd: 0.75, byDepartment: { design: 0.75 }, byAgent: { 'agent-2': 0.75 } });
    expect(await sink.getAggregateCost()).toMatchObject({ estimatedCostUsd: 1, byDepartment: { engineering: 0.25, design: 0.75 }, byAgent: { 'agent-1': 0.25, 'agent-2': 0.75 } });
  });

  it('allows usage exactly at a budget and pauses only the exceeded branch with escalation details', async () => {
    const usageStore = new InMemoryCostUsage();
    const input: BudgetCheckInput = {
      workflowId: workflowId('workflow-1'), taskId: taskId('task-1'),
      agentDefinitionId: agentDefinitionId('agent-1'), department: 'engineering',
      taskBudget: { maxTokens: 15, maxCostUsd: 0.25 }, agentBudget: { maxTokens: 15, maxCostUsd: 0.25 },
      workflowBudget: { maxTokens: 15, maxCostUsd: 0.25 }
    };
    await usageStore.recordUsage(usage());
    expect(await usageStore.checkBudget(input)).toEqual({ kind: 'allowed' });
    const blocked = await usageStore.checkBudget({ ...input,
      taskBudget: { maxTokens: 15, maxCostUsd: 0.2 } });
    expect(blocked).toMatchObject({ kind: 'exceeded', scope: 'task', branchTaskId: 'task-1',
      decision: 'PAUSE_BRANCH', escalation: { workflowId: 'workflow-1', taskId: 'task-1' } });
    expect(() => new BudgetExceededError(blocked as Extract<typeof blocked, { kind: 'exceeded' }>)).not.toThrow();
  });

  it('checks agent and workflow limits and reports the narrowest exceeded scope', async () => {
    const usageStore = new InMemoryCostUsage();
    await usageStore.recordUsage(usage());
    const input: BudgetCheckInput = {
      workflowId: workflowId('workflow-1'), taskId: taskId('task-1'),
      agentDefinitionId: agentDefinitionId('agent-1'), department: 'engineering',
      taskBudget: { maxTokens: 100, maxCostUsd: 10 }, agentBudget: { maxTokens: 100, maxCostUsd: 0.2 },
      workflowBudget: { maxTokens: 100, maxCostUsd: 0.1 }
    };
    expect(await usageStore.checkBudget(input)).toMatchObject({ kind: 'exceeded', scope: 'agent', branchTaskId: 'task-1' });
    expect(await usageStore.checkBudget({ ...input, agentBudget: { maxTokens: 100, maxCostUsd: 10 } }))
      .toMatchObject({ kind: 'exceeded', scope: 'workflow', branchTaskId: 'task-1' });
  });

  it('rejects invalid budgets instead of silently allowing a dispatch', async () => {
    const usageStore = new InMemoryCostUsage();
    const input: BudgetCheckInput = {
      workflowId: workflowId('workflow-1'), taskId: taskId('task-1'),
      agentDefinitionId: agentDefinitionId('agent-1'), department: 'engineering',
      taskBudget: { maxTokens: -1, maxCostUsd: 1 }, agentBudget: { maxTokens: 10, maxCostUsd: 1 },
      workflowBudget: { maxTokens: 10, maxCostUsd: 1 }
    };
    await expect(usageStore.checkBudget(input)).rejects.toThrow(/task maxTokens/i);
  });
});
