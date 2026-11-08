import { describe, expect, it } from 'vitest';
import {
  agentDefinitionId, agentSessionId, correlationId, taskId, workflowId,
  type Task
} from '@aicompany/contracts';
import { InMemoryTaskRepository } from './test-support/inmemory-store';
import { InMemoryApprovalStore, ApprovalServiceError, ApprovalServiceImpl } from './approvals';
import { InMemoryCeoCommandService } from './ceo-commands';

const now = new Date('2026-11-08T00:00:00Z');
const task: Task = {
  id: taskId('deploy-task'), workflowId: workflowId('workflow-1'), state: 'WAITING_FOR_APPROVAL',
  dependencyIds: [], requiredCapabilities: ['deploy.staging'], outputContract: 'deployed',
  budget: { maxTokens: 100, maxCostUsd: 1 }, recoveryCycles: 0, projectId: 'project-1',
  parentTaskId: null, ownerAgentDefinitionId: agentDefinitionId('release-agent'), deadline: null,
  traceId: correlationId('trace-1'), version: 0, createdAt: now, updatedAt: now, isDeployment: true
};
const actor = { kind: 'AGENT' as const, sessionId: agentSessionId('session-1') };
const approvalInput = {
  subjectType: 'DEPLOYMENT' as const, subjectId: task.id, reason: 'Release staging',
  requestedBy: actor, correlationId: task.traceId, idempotencyKey: 'request-1'
};

const service = () => {
  const tasks = new InMemoryTaskRepository();
  const events: Array<{ eventType?: string; payload?: unknown }> = [];
  const commands: Array<{ type?: string }> = [];
  void tasks.save(task, 0);
  const persistence = {
    async saveTaskAndAppend(input: { task: Task; expectedVersion: number; events: readonly import('@aicompany/contracts').DomainEvent[]; commands: readonly import('@aicompany/contracts').OutboxCommand[] }) {
      await tasks.save(input.task, input.expectedVersion); events.push(...input.events); commands.push(...input.commands);
    }, async claimDispatch() { return null; }, async releaseDispatch() { return false; }
  };
  const approvals = new InMemoryApprovalStore();
  const instance = new ApprovalServiceImpl({ approvals, taskRepository: tasks, transactionalPersistence: persistence, now: () => now });
  return { instance, approvals, tasks, events, commands };
};

describe('ApprovalServiceImpl', () => {
  it('returns the same approval for an identical idempotent request', async () => {
    const { instance } = service();
    const first = await instance.request(approvalInput);
    const second = await instance.request(approvalInput);
    expect(second).toEqual(first);
    expect(second.version).toBe(0);
    await expect(instance.request({ ...approvalInput, reason: 'Different request' })).rejects.toThrow(/idempotency key/i);
  });

  it('requires CEO decisions, checks optimistic versions, and records approve or reject', async () => {
    const { instance, events, commands, tasks } = service();
    const approval = await instance.request(approvalInput);
    await expect(instance.decide({ approvalId: approval.approvalId, decision: 'APPROVE', actor, reason: 'ok', expectedVersion: 0, idempotencyKey: 'decision-1' }))
      .rejects.toBeInstanceOf(ApprovalServiceError);
    const approved = await instance.decide({ approvalId: approval.approvalId, decision: 'APPROVE', actor: { kind: 'CEO' }, reason: 'approved', expectedVersion: 0, idempotencyKey: 'decision-1' });
    expect(approved).toMatchObject({ state: 'APPROVED', version: 1, decision: 'APPROVE' });
    expect(events).toHaveLength(1);
    expect(commands).toHaveLength(1);
    expect(await tasks.get(task.id)).toMatchObject({ state: 'COMPLETED', version: 1 });
    expect(commands[0]).toMatchObject({ type: 'DEPLOY' });
    await expect(instance.decide({ approvalId: approval.approvalId, decision: 'APPROVE', actor: { kind: 'CEO' }, reason: 'approved', expectedVersion: 0, idempotencyKey: 'decision-1' }))
      .resolves.toEqual(approved);
    expect(commands).toHaveLength(1);
    await expect(instance.decide({ approvalId: approval.approvalId, decision: 'REJECT', actor: { kind: 'CEO' }, reason: 'no', expectedVersion: 0, idempotencyKey: 'decision-2' }))
      .rejects.toThrow(/version|stale/i);
  });

  it('returns a deployment task to review with the rejection reason', async () => {
    const { instance, tasks, events } = service();
    const approval = await instance.request(approvalInput);
    await instance.decide({ approvalId: approval.approvalId, decision: 'REJECT', actor: { kind: 'CEO' }, reason: 'Missing rollback plan', expectedVersion: 0, idempotencyKey: 'decision-reject' });
    expect(await tasks.get(task.id)).toMatchObject({ state: 'REVIEW', version: 1 });
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ eventType: 'APPROVAL_REJECTED', payload: expect.objectContaining({ reason: 'Missing rollback plan' }) })]));
  });

  it('does not emit duplicate commands for a repeated CEO command key', async () => {
    const calls: string[] = [];
    const commands = new InMemoryCeoCommandService({ actor: { kind: 'CEO' }, idempotency: new Map(), execute: async (name) => { calls.push(name); } });
    await commands.pauseWorkflow(workflowId('workflow-1'), 'maintenance');
    await commands.pauseWorkflow(workflowId('workflow-1'), 'maintenance');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ command: 'pauseWorkflow', actor: { kind: 'CEO' }, reason: 'maintenance', idempotencyKey: expect.any(String), correlationId: expect.any(String) });
  });

  it('rejects every CEO command from a non-CEO actor', async () => {
    const commands = new InMemoryCeoCommandService({ actor, idempotency: new Map(), execute: async () => undefined });
    await expect(commands.cancelTask(taskId('task-1'), 'reason')).rejects.toThrow(/CEO/i);
    await expect(commands.pauseWorkflow(workflowId('workflow-1'), 'reason')).rejects.toThrow(/CEO/i);
    await expect(commands.resumeWorkflow(workflowId('workflow-1'))).rejects.toThrow(/CEO/i);
    await expect(commands.reassignTask(taskId('task-1'), agentDefinitionId('agent-2'))).rejects.toThrow(/CEO/i);
  });
});
