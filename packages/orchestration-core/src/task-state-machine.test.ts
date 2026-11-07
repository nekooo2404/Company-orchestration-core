import { describe, expect, it } from 'vitest';
import {
  DomainEventSchema,
  type Task,
  agentSessionId,
  approvalId,
  correlationId,
  taskId,
  workflowId
} from '@aicompany/contracts';
import {
  InvalidTaskTransitionError,
  transitionTask,
  type TransitionContext
} from './index';

const now = new Date('2026-11-08T00:00:00.000Z');

const context: TransitionContext = {
  actor: { kind: 'SYSTEM', name: 'orchestrator' },
  now,
  evidenceIds: [],
  isDeployment: false
};

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: taskId('task-1'),
  workflowId: workflowId('workflow-1'),
  state: 'PENDING',
  dependencyIds: [],
  requiredCapabilities: ['repo.read'],
  outputContract: 'validated output',
  budget: { maxTokens: 1000, maxCostUsd: 1 },
  recoveryCycles: 0,
  projectId: 'project-1',
  parentTaskId: null,
  ownerAgentDefinitionId: null,
  deadline: null,
  traceId: correlationId('trace-1'),
  version: 0,
  createdAt: now,
  updatedAt: now,
  ...overrides
});

describe('transitionTask', () => {
  it('moves a pending task to ready without mutating the input', () => {
    const task = makeTask({ version: 4 });

    const result = transitionTask(task, { type: 'TASK_READY' }, context);

    expect(result.task).not.toBe(task);
    expect(task.state).toBe('PENDING');
    expect(result.task.state).toBe('READY');
    expect(result.task.version).toBe(5);
    expect(result.task.updatedAt).toBe(now);
    expect(result.event.eventType).toBe('TASK_READY');
    expect(result.event.aggregateVersion).toBe(5);
    expect(DomainEventSchema.safeParse(result.event).success).toBe(true);
    expect(Object.isFrozen(result.task)).toBe(true);
    expect(Object.isFrozen(result.event)).toBe(true);
  });

  it('follows the ready, running, review and completed path with versioned events', () => {
    const ready = transitionTask(makeTask(), { type: 'TASK_READY' }, context).task;
    const started = transitionTask(
      ready,
      { type: 'TASK_STARTED', sessionId: agentSessionId('session-1') },
      context
    ).task;
    const review = transitionTask(
      started,
      { type: 'TASK_REVIEW_REQUESTED' },
      { ...context, evidenceIds: ['artifact-1'] }
    ).task;
    const completed = transitionTask(
      review,
      { type: 'TASK_COMPLETED', evidenceIds: ['artifact-1'] },
      context
    );

    expect(started.state).toBe('RUNNING');
    expect(review.state).toBe('REVIEW');
    expect(completed.task.state).toBe('COMPLETED');
    expect(completed.task.version).toBe(4);
    expect(completed.event.eventType).toBe('TASK_COMPLETED');
    expect(completed.event.payload).toEqual({
      evidenceIds: ['artifact-1'],
      taskId: 'task-1'
    });
  });

  it('rejects completion without evidence with a typed transition error', () => {
    const running = makeTask({ state: 'RUNNING' });

    expect(() =>
      transitionTask(running, { type: 'TASK_COMPLETED', evidenceIds: [] }, context)
    ).toThrow(InvalidTaskTransitionError);
  });

  it('rejects transitions that are not allowed from the current state', () => {
    const completed = makeTask({ state: 'COMPLETED' });

    expect(() => transitionTask(completed, { type: 'TASK_STARTED', sessionId: agentSessionId('session-1') }, context))
      .toThrow(InvalidTaskTransitionError);
  });

  it('keeps FAILED as the attempt failure state and starts recovery separately', () => {
    const failed = transitionTask(
      makeTask({ state: 'RUNNING' }),
      { type: 'TASK_FAILED', failureFingerprint: 'test-failure' },
      context
    ).task;

    const recovering = transitionTask(
      failed,
      { type: 'RECOVERY_STARTED', recoveryId: 'recovery-1' },
      context
    );

    expect(failed.state).toBe('FAILED');
    expect(failed.recoveryCycles).toBe(0);
    expect(recovering.task.state).toBe('RECOVERING');
    expect(recovering.task.recoveryCycles).toBe(1);
    expect(recovering.event.eventType).toBe('RECOVERY_STARTED');
  });

  it('allows the fifth recovery cycle to escalate to the CEO', () => {
    const fifthCycle = transitionTask(
      makeTask({ state: 'FAILED', recoveryCycles: 4 }),
      { type: 'RECOVERY_STARTED', recoveryId: 'recovery-5' },
      context
    ).task;

    const escalated = transitionTask(
      fifthCycle,
      { type: 'TASK_ESCALATED', reason: 'maximum recovery cycles exhausted' },
      context
    );

    expect(fifthCycle.recoveryCycles).toBe(5);
    expect(escalated.task.state).toBe('ESCALATED_TO_CEO');
    expect(escalated.event.eventType).toBe('TASK_ESCALATED');
  });

  it('puts a deployment task in waiting for approval instead of completing it', () => {
    const result = transitionTask(
      makeTask({ state: 'REVIEW', isDeployment: true }),
      { type: 'TASK_COMPLETED', evidenceIds: ['staging-artifact'] },
      { ...context, isDeployment: true }
    );

    expect(result.task.state).toBe('WAITING_FOR_APPROVAL');
    expect(result.event.eventType).toBe('DEPLOYMENT_APPROVAL_REQUESTED');
    expect(result.event.payload).toMatchObject({ taskId: 'task-1' });
    expect(DomainEventSchema.safeParse(result.event).success).toBe(true);
  });

  it('accepts an explicit deployment approval request with its approval ID', () => {
    const result = transitionTask(
      makeTask({ state: 'REVIEW' }),
      { type: 'APPROVAL_REQUESTED', approvalId: approvalId('approval-1') },
      { ...context, isDeployment: true }
    );

    expect(result.task.state).toBe('WAITING_FOR_APPROVAL');
    expect(result.event.eventType).toBe('DEPLOYMENT_APPROVAL_REQUESTED');
    expect(result.event.payload).toEqual({
      approvalId: 'approval-1',
      taskId: 'task-1'
    });
  });
});
