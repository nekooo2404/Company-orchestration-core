import { describe, expect, it } from 'vitest';
import {
  agentDefinitionId,
  agentSessionId,
  correlationId,
  taskId,
  workflowId,
  type Task
} from '@aicompany/contracts';
import {
  InMemoryApprovalTransactionalPersistence,
  InMemoryEventStore,
  InMemoryOutbox,
  InMemoryTaskRepository
} from './test-support/inmemory-store';
import { InMemoryApprovalStore, ApprovalServiceError, ApprovalServiceImpl } from './approvals';
import { InMemoryCeoCommandService, type CeoCommand } from './ceo-commands';

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

const service = (failAfter?: 'after-approval' | 'after-task' | 'after-approval-event' | 'after-task-event' | 'after-outbox') => {
  const tasks = new InMemoryTaskRepository();
  const events = new InMemoryEventStore();
  const outbox = new InMemoryOutbox({ now: () => now });
  const approvals = new InMemoryApprovalStore();
  void tasks.save(task, 0);
  const persistence = new InMemoryApprovalTransactionalPersistence({ tasks, events, outbox, approvals, failAfter });
  const instance = new ApprovalServiceImpl({ approvals, taskRepository: tasks, transactionalPersistence: persistence, now: () => now });
  return { instance, approvals, tasks, events, outbox, persistence };
};

const approve = (approvalId: string, idempotencyKey = 'decision-approve') => ({
  approvalId: approvalId as never, decision: 'APPROVE' as const, actor: { kind: 'CEO' as const },
  reason: 'approved', expectedVersion: 0, idempotencyKey
});

describe('ApprovalServiceImpl', () => {
  it('returns the same approval for an identical idempotent request', async () => {
    const { instance } = service();
    const first = await instance.request(approvalInput);
    const second = await instance.request(approvalInput);
    expect(second).toEqual(first);
    expect(second.version).toBe(0);
    await expect(instance.request({ ...approvalInput, reason: 'Different request' })).rejects.toThrow(/idempotency key/i);
  });

  it('atomically approves a deployment, keeps it running, and emits one DEPLOY command', async () => {
    const { instance, approvals, tasks, events, outbox } = service();
    const requested = await instance.request(approvalInput);
    const approved = await instance.decide(approve(requested.approvalId));
    expect(approved).toMatchObject({ state: 'APPROVED', version: 1, decision: 'APPROVE', reason: 'Release staging', decisionReason: 'approved' });
    expect(await tasks.get(task.id)).toMatchObject({ state: 'RUNNING', version: 1 });
    expect(await events.readStream(requested.approvalId)).toEqual(expect.arrayContaining([expect.objectContaining({ eventType: 'APPROVAL_APPROVED', payload: expect.objectContaining({ decisionReason: 'approved' }) })]));
    expect(await events.readStream(task.id)).toEqual(expect.arrayContaining([expect.objectContaining({ eventType: 'DEPLOYMENT_APPROVED' })]));
    expect(await outbox.claim(10, 'deploy-worker')).toEqual([expect.objectContaining({ type: 'DEPLOY', payload: { taskId: task.id, approvalId: requested.approvalId } })]);
    expect(await approvals.get(requested.approvalId)).toEqual(approved);
  });

  it('requires CEO decisions, checks optimistic versions, and replays the same decision idempotently', async () => {
    const { instance, outbox } = service();
    const approval = await instance.request(approvalInput);
    await expect(instance.decide({ ...approve(approval.approvalId), actor })).rejects.toBeInstanceOf(ApprovalServiceError);
    const approved = await instance.decide(approve(approval.approvalId));
    await expect(instance.decide(approve(approval.approvalId))).resolves.toEqual(approved);
    await expect(instance.decide(approve(approval.approvalId, 'decision-stale'))).rejects.toThrow(/version|pending/i);
    expect(await outbox.claim(10, 'deploy-worker')).toHaveLength(1);
  });

  it('returns a deployment task to review while preserving request and decision reasons', async () => {
    const { instance, approvals, tasks, events } = service();
    const requested = await instance.request(approvalInput);
    const rejected = await instance.decide({ ...approve(requested.approvalId, 'decision-reject'), decision: 'REJECT', reason: 'Missing rollback plan' });
    expect(rejected).toMatchObject({ state: 'REJECTED', reason: 'Release staging', decisionReason: 'Missing rollback plan' });
    expect(await tasks.get(task.id)).toMatchObject({ state: 'REVIEW', version: 1 });
    expect(await approvals.get(requested.approvalId)).toMatchObject({ reason: 'Release staging', decisionReason: 'Missing rollback plan' });
    expect(await events.readStream(task.id)).toEqual(expect.arrayContaining([expect.objectContaining({ eventType: 'DEPLOYMENT_REJECTED', payload: expect.objectContaining({ reason: 'Missing rollback plan' }) })]));
  });

  it('rolls back approval, task, events, and outbox when atomic persistence fails', async () => {
    const { instance, approvals, tasks, events, outbox } = service('after-task');
    const requested = await instance.request(approvalInput);
    await expect(instance.decide(approve(requested.approvalId))).rejects.toThrow(/injected atomic approval failure/i);
    expect(await approvals.get(requested.approvalId)).toMatchObject({ state: 'PENDING', version: 0, decisionReason: null });
    expect(await tasks.get(task.id)).toMatchObject({ state: 'WAITING_FOR_APPROVAL', version: 0 });
    expect(await events.readStream(requested.approvalId)).toEqual([]);
    expect(await events.readStream(task.id)).toEqual([]);
    expect(await outbox.claim(10, 'rollback-check')).toEqual([]);
  });

  it('does not emit duplicate commands for repeated CEO input and rejects changed reuse', async () => {
    const calls: CeoCommand[] = [];
    const commands = new InMemoryCeoCommandService({ execute: async (command) => { calls.push(command); } });
    const input = {
      workflowId: workflowId('workflow-1'), actor: { kind: 'CEO' } as const,
      reason: 'maintenance', idempotencyKey: 'ceo-command-1', correlationId: correlationId('ceo-trace-1')
    };
    await commands.pauseWorkflow(input);
    await commands.pauseWorkflow(input);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ command: 'pauseWorkflow', actor: { kind: 'CEO' }, reason: 'maintenance', idempotencyKey: 'ceo-command-1', correlationId: correlationId('ceo-trace-1') });
    await expect(commands.pauseWorkflow({ ...input, reason: 'changed' })).rejects.toThrow(/idempotency/i);
    await expect(commands.pauseWorkflow({ ...input, correlationId: correlationId('ceo-trace-2') })).rejects.toThrow(/idempotency/i);
  });

  it('enforces CEO authentication separately for every command invocation', async () => {
    const commands = new InMemoryCeoCommandService({ execute: async () => undefined });
    const envelope = { actor, reason: 'reason', idempotencyKey: 'non-ceo-1', correlationId: correlationId('non-ceo-trace') };
    await expect(commands.cancelTask({ ...envelope, taskId: taskId('task-1') })).rejects.toThrow(/CEO/i);
    await expect(commands.pauseWorkflow({ ...envelope, workflowId: workflowId('workflow-1') })).rejects.toThrow(/CEO/i);
    await expect(commands.resumeWorkflow({ ...envelope, workflowId: workflowId('workflow-1') })).rejects.toThrow(/CEO/i);
    await expect(commands.reassignTask({ ...envelope, taskId: taskId('task-1'), agentDefinitionId: agentDefinitionId('agent-2') })).rejects.toThrow(/CEO/i);
  });
});
