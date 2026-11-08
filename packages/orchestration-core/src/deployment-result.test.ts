import { describe, expect, it } from 'vitest';
import { approvalId, correlationId, taskId, workflowId, type Task } from '@aicompany/contracts';
import { InMemoryApprovalStore } from './approvals';
import { DeploymentResultRecorder } from './deployment-result';
import { InMemoryApprovalTransactionalPersistence, InMemoryEventStore, InMemoryOutbox, InMemoryTaskRepository } from './test-support/inmemory-store';

const now = new Date('2026-11-08T00:00:00Z');
const deployment: Task = {
  id: taskId('deployment-1'), workflowId: workflowId('workflow-1'), state: 'RUNNING',
  dependencyIds: [], requiredCapabilities: [], outputContract: 'deployed',
  budget: { maxTokens: 100, maxCostUsd: 1 }, recoveryCycles: 0, projectId: 'project-1',
  parentTaskId: null, ownerAgentDefinitionId: null, deadline: null, traceId: correlationId('trace-1'),
  version: 0, createdAt: now, updatedAt: now, isDeployment: true,
  deploymentApprovalId: approvalId('approval-1'), deploymentAttemptId: 'deploy:deployment-1:approval-1'
};

describe('deployment result recorder', () => {
  it('completes only from matching verified result evidence', async () => {
    const tasks = new InMemoryTaskRepository();
    const events = new InMemoryEventStore();
    const outbox = new InMemoryOutbox();
    await tasks.save(deployment, 0);
    const persistence = new InMemoryApprovalTransactionalPersistence({ tasks, events, outbox,
      approvals: new InMemoryApprovalStore() });
    let result: { approvalId: typeof deployment.deploymentApprovalId; attemptId: string; succeeded: boolean; evidenceIds: string[] } | null = null;
    const recorder = new DeploymentResultRecorder({ tasks, persistence,
      verifier: { async verify() { return result; } }, now: () => now });
    await expect(recorder.record(deployment.id)).rejects.toThrow(/verified/i);
    result = { approvalId: approvalId('approval-1'), attemptId: 'wrong', succeeded: true, evidenceIds: ['receipt-1'] };
    await expect(recorder.record(deployment.id)).rejects.toThrow(/attempt/i);
    expect((await tasks.get(deployment.id))?.state).toBe('RUNNING');
    result = { ...result, attemptId: deployment.deploymentAttemptId! };
    expect((await recorder.record(deployment.id)).state).toBe('COMPLETED');
    expect((await events.readStream(deployment.id))[0].payload).toMatchObject({
      approvalId: 'approval-1', attemptId: 'deploy:deployment-1:approval-1', evidenceIds: ['receipt-1']
    });
  });
});
