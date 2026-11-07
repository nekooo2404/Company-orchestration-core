import { describe, expect, it } from 'vitest';
import {
  ActorRefSchema,
  AgentSessionSchema,
  AgentSessionStateSchema,
  ApprovalRecordSchema,
  ApprovalStateSchema,
  DomainEventSchema,
  EventTypeSchema,
  TaskSchema,
  TaskStateSchema,
  agentDefinitionId,
  agentSessionId,
  approvalId,
  correlationId,
  eventId,
  taskId,
  workflowId
} from './index';

const now = new Date('2026-11-08T00:00:00.000Z');

const validTask = {
  id: taskId('task-1'),
  workflowId: workflowId('workflow-1'),
  state: 'READY',
  dependencyIds: [],
  requiredCapabilities: ['repo.read'],
  outputContract: 'test report',
  budget: { maxTokens: 1000, maxCostUsd: 1 },
  recoveryCycles: 0,
  version: 0,
  createdAt: now,
  updatedAt: now
};

describe('shared orchestration contracts', () => {
  it('accepts every canonical task state, including recovery and approval states', () => {
    expect(TaskStateSchema.options).toEqual([
      'PENDING',
      'READY',
      'RUNNING',
      'REVIEW',
      'COMPLETED',
      'BLOCKED',
      'RECOVERING',
      'FAILED',
      'ESCALATED_TO_CEO',
      'CANCELLED',
      'WAITING_FOR_APPROVAL'
    ]);

    for (const state of TaskStateSchema.options) {
      expect(TaskSchema.safeParse({ ...validTask, state }).success).toBe(true);
    }
    expect(TaskStateSchema.safeParse('UNKNOWN').success).toBe(false);
  });

  it('rejects empty branded IDs and preserves valid values', () => {
    expect(workflowId('workflow-1')).toBe('workflow-1');
    expect(taskId('task-1')).toBe('task-1');
    expect(agentDefinitionId('agent-definition-1')).toBe('agent-definition-1');
    expect(agentSessionId('session-1')).toBe('session-1');
    expect(eventId('event-1')).toBe('event-1');
    expect(approvalId('approval-1')).toBe('approval-1');
    expect(correlationId('correlation-1')).toBe('correlation-1');

    expect(() => workflowId('')).toThrow('WorkflowId cannot be empty');
    expect(() => taskId('')).toThrow('TaskId cannot be empty');
    expect(() => agentDefinitionId('')).toThrow('AgentDefinitionId cannot be empty');
    expect(() => agentSessionId('')).toThrow('AgentSessionId cannot be empty');
    expect(() => eventId('')).toThrow('EventId cannot be empty');
    expect(() => approvalId('')).toThrow('ApprovalId cannot be empty');
    expect(() => correlationId('')).toThrow('CorrelationId cannot be empty');
  });

  it('parses a valid task with mutable aggregate metadata', () => {
    const result = TaskSchema.safeParse(validTask);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('task-1');
      expect(result.data.updatedAt).toEqual(now);
      expect(result.data.version).toBe(0);
    }
  });

  it('rejects a task with a negative budget', () => {
    const result = TaskSchema.safeParse({
      ...validTask,
      budget: { maxTokens: -1, maxCostUsd: 1 }
    });

    expect(result.success).toBe(false);
  });

  it('rejects a task with an empty output contract', () => {
    const result = TaskSchema.safeParse({ ...validTask, outputContract: '   ' });

    expect(result.success).toBe(false);
  });

  it('rejects a task with an unknown state and more than five recovery cycles', () => {
    expect(TaskSchema.safeParse({ ...validTask, state: 'PAUSED' }).success).toBe(false);
    expect(TaskSchema.safeParse({ ...validTask, recoveryCycles: 6 }).success).toBe(false);
  });

  it('validates CEO, agent and system actor references', () => {
    expect(ActorRefSchema.safeParse({ kind: 'CEO' }).success).toBe(true);
    expect(
      ActorRefSchema.safeParse({ kind: 'AGENT', sessionId: agentSessionId('session-1') }).success
    ).toBe(true);
    expect(ActorRefSchema.safeParse({ kind: 'SYSTEM', name: 'orchestrator' }).success).toBe(true);
    expect(ActorRefSchema.safeParse({ kind: 'AGENT' }).success).toBe(false);
  });

  it('parses an agent session with trace, usage and checkpoint metadata', () => {
    const result = AgentSessionSchema.safeParse({
      sessionId: agentSessionId('session-1'),
      taskId: taskId('task-1'),
      workflowId: workflowId('workflow-1'),
      agentDefinitionId: agentDefinitionId('agent-definition-1'),
      state: 'RUNNING',
      contextReference: 'context://session-1',
      checkpointReference: null,
      traceId: correlationId('trace-1'),
      usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.01 },
      toolCallHistory: [],
      version: 0,
      createdAt: now,
      updatedAt: now
    });

    expect(result.success).toBe(true);
  });

  it('rejects unknown agent session and approval states', () => {
    expect(AgentSessionStateSchema.safeParse('UNKNOWN').success).toBe(false);
    expect(ApprovalStateSchema.safeParse('UNKNOWN').success).toBe(false);
  });

  it('parses a versioned event envelope with a nullable causation ID', () => {
    const result = DomainEventSchema.safeParse({
      eventId: eventId('event-1'),
      aggregateType: 'TASK',
      aggregateId: taskId('task-1'),
      aggregateVersion: 1,
      eventType: 'TASK_COMPLETED',
      actor: { kind: 'SYSTEM', name: 'orchestrator' },
      correlationId: correlationId('correlation-1'),
      causationId: null,
      occurredAt: now,
      payload: { evidenceIds: ['artifact-1'] }
    });

    expect(result.success).toBe(true);
    expect(EventTypeSchema.safeParse('TASK_COMPLETED').success).toBe(true);
    expect(
      DomainEventSchema.safeParse({
        eventId: eventId('event-2'),
        aggregateType: 'TASK',
        aggregateId: taskId('task-1'),
        aggregateVersion: 2,
        eventType: 'NOT_AN_EVENT',
        actor: { kind: 'SYSTEM', name: 'orchestrator' },
        correlationId: correlationId('correlation-1'),
        causationId: eventId('event-1'),
        occurredAt: now,
        payload: {}
      }).success
    ).toBe(false);
  });

  it('parses an approval record with a pending decision', () => {
    const result = ApprovalRecordSchema.safeParse({
      approvalId: approvalId('approval-1'),
      subjectType: 'DEPLOYMENT',
      subjectId: taskId('task-1'),
      reason: 'staging evidence verified',
      requestedBy: { kind: 'SYSTEM', name: 'orchestrator' },
      state: 'PENDING',
      decision: null,
      decidedBy: null,
      version: 0,
      createdAt: now,
      updatedAt: now
    });

    expect(result.success).toBe(true);
  });
});
