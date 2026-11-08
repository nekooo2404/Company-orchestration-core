import { describe, expect, it } from 'vitest';
import {
  ActorRefSchema,
  AgentSessionSchema,
  AgentSessionStateSchema,
  ApprovalRecordSchema,
  ApprovalStateSchema,
  CommandTypeSchema,
  DomainEventSchema,
  EventPayloadSchema,
  EventTypeSchema,
  OutboxCommandSchema,
  StartAgentSessionPayloadSchema,
  TaskSchema,
  TaskIdSchema,
  TaskStateSchema,
  WorkflowIdSchema,
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
  projectId: 'project-1',
  parentTaskId: null,
  ownerAgentDefinitionId: null,
  deadline: null,
  traceId: correlationId('trace-1'),
  version: 0,
  createdAt: now,
  updatedAt: now
};

const validApproval = {
  approvalId: approvalId('approval-1'),
  subjectType: 'DEPLOYMENT',
  subjectId: taskId('task-1'),
  reason: 'staging evidence verified',
  requestedBy: { kind: 'SYSTEM', name: 'orchestrator' },
  correlationId: correlationId('correlation-1'),
  causationId: eventId('event-1'),
  state: 'PENDING',
  decision: null,
  decidedBy: null,
  decidedAt: null,
  version: 0,
  createdAt: now,
  updatedAt: now
};

const validCommand = {
  commandId: 'command-1',
  type: 'DEPLOY',
  payload: { taskId: taskId('task-1'), approvalId: approvalId('approval-1') },
  actor: { kind: 'SYSTEM', name: 'orchestrator' },
  issuedAt: now,
  availableAt: now,
  correlationId: correlationId('correlation-1'),
  causationId: eventId('event-1')
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

    expect(workflowId('  workflow-padded  ')).toBe('workflow-padded');
    expect(WorkflowIdSchema.parse('  workflow-schema-padded  ')).toBe('workflow-schema-padded');
    expect(TaskIdSchema.parse('  task-schema-padded  ')).toBe('task-schema-padded');
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

  it('requires task identity metadata and distinguishes null from undefined', () => {
    expect(TaskSchema.safeParse(validTask).success).toBe(true);
    expect(TaskSchema.safeParse({ ...validTask, parentTaskId: undefined }).success).toBe(false);
    expect(TaskSchema.safeParse({ ...validTask, ownerAgentDefinitionId: undefined }).success).toBe(false);
    expect(TaskSchema.safeParse({ ...validTask, deadline: undefined }).success).toBe(false);
    expect(TaskSchema.safeParse({ ...validTask, projectId: undefined }).success).toBe(false);
    expect(TaskSchema.safeParse({ ...validTask, traceId: undefined }).success).toBe(false);
    expect(TaskSchema.safeParse({ ...validTask, projectId: null }).success).toBe(false);
    expect(TaskSchema.safeParse({ ...validTask, traceId: null }).success).toBe(false);

    const { projectId, traceId, ...missingAuditMetadata } = validTask;
    expect(TaskSchema.safeParse(missingAuditMetadata).success).toBe(false);
    expect(projectId).toBe('project-1');
    expect(traceId).toBe('trace-1');
  });

  it('normalizes padded task trace IDs through the schema', () => {
    const result = TaskSchema.safeParse({ ...validTask, traceId: '  trace-padded  ' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.traceId).toBe('trace-padded');
    }
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

  it('exposes the canonical event type set without overlapping transition aliases', () => {
    expect(EventTypeSchema.options).toEqual([
      'TASK_CREATED',
      'TASK_READY',
      'TASK_STARTED',
      'TASK_PROGRESS',
      'REVIEW_REQUESTED',
      'ARTIFACT_CREATED',
      'BLOCKED',
      'TASK_FAILED',
      'RECOVERY_STARTED',
      'TASK_COMPLETED',
      'DEPLOYMENT_APPROVAL_REQUESTED',
      'APPROVAL_REQUESTED',
      'TASK_ESCALATED',
      'TASK_CANCELLED',
      'AGENT_SESSION_CREATED',
      'AGENT_SESSION_STARTED',
      'AGENT_SESSION_PAUSED',
      'AGENT_SESSION_RESUMED',
      'AGENT_SESSION_COMPLETED',
      'AGENT_SESSION_FAILED',
      'AGENT_SESSION_CANCELLED',
      'APPROVAL_APPROVED',
      'APPROVAL_REJECTED'
    ]);
    expect(EventTypeSchema.safeParse('TASK_BLOCKED').success).toBe(false);
    expect(EventTypeSchema.safeParse('TASK_REVIEW_REQUESTED').success).toBe(false);
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
      causationId: eventId('event-0'),
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

  it('requires event audit metadata and event-specific payloads', () => {
    const validEvent = {
      eventId: eventId('event-3'),
      aggregateType: 'TASK',
      aggregateId: taskId('task-1'),
      aggregateVersion: 1,
      eventType: 'TASK_READY',
      actor: { kind: 'SYSTEM', name: 'orchestrator' },
      correlationId: correlationId('correlation-1'),
      causationId: eventId('event-0'),
      occurredAt: now,
      payload: { taskId: taskId('task-1') }
    };

    expect(DomainEventSchema.safeParse(validEvent).success).toBe(true);
    expect(DomainEventSchema.safeParse({ ...validEvent, causationId: null }).success).toBe(false);
    expect(DomainEventSchema.safeParse({ ...validEvent, causationId: undefined }).success).toBe(false);
    expect(DomainEventSchema.safeParse({ ...validEvent, correlationId: undefined }).success).toBe(false);
    expect(DomainEventSchema.safeParse({ ...validEvent, payload: {} }).success).toBe(false);
    expect(
      DomainEventSchema.safeParse({ ...validEvent, eventType: 'TASK_STARTED', payload: { taskId: taskId('task-1') } }).success
    ).toBe(false);
    expect(
      DomainEventSchema.safeParse({ ...validEvent, eventType: 'TASK_PROGRESS', payload: {} }).success
    ).toBe(false);
  });

  it('rejects empty payloads for every canonical event type', () => {
    for (const eventType of EventTypeSchema.options) {
      expect(
        DomainEventSchema.safeParse({
          eventId: eventId(`event-${eventType}`),
          aggregateType: 'TASK',
          aggregateId: taskId('task-1'),
          aggregateVersion: 1,
          eventType,
          actor: { kind: 'SYSTEM', name: 'orchestrator' },
          correlationId: correlationId('correlation-1'),
          causationId: eventId('event-0'),
          occurredAt: now,
          payload: {}
        }).success
      ).toBe(false);
    }
    expect(EventPayloadSchema.safeParse({}).success).toBe(false);
    expect(EventPayloadSchema.safeParse({ reason: 42 }).success).toBe(false);
  });

  it('requires a discriminated command payload and audit metadata', () => {
    expect(OutboxCommandSchema.safeParse(validCommand).success).toBe(true);
    expect(CommandTypeSchema.safeParse('DEPLOY').success).toBe(true);
    expect(OutboxCommandSchema.safeParse({ ...validCommand, actor: undefined }).success).toBe(false);
    expect(OutboxCommandSchema.safeParse({ ...validCommand, issuedAt: undefined }).success).toBe(false);
    expect(OutboxCommandSchema.safeParse({ ...validCommand, correlationId: undefined }).success).toBe(false);
    expect(OutboxCommandSchema.safeParse({ ...validCommand, causationId: undefined }).success).toBe(false);
    expect(OutboxCommandSchema.safeParse({ ...validCommand, causationId: null }).success).toBe(false);
    expect(
      OutboxCommandSchema.safeParse({ ...validCommand, payload: { taskId: taskId('task-1') } }).success
    ).toBe(false);
    expect(OutboxCommandSchema.safeParse({ ...validCommand, payload: {} }).success).toBe(false);
  });

  it('requires an explicit session idempotency key for agent session commands', () => {
    const payload = {
      taskId: taskId('task-1'),
      workflowId: workflowId('workflow-1'),
      agentDefinitionId: agentDefinitionId('agent-definition-1'),
      leaseId: 'lease-1',
      idempotencyKey: agentSessionId('session-1')
    };

    expect(StartAgentSessionPayloadSchema.safeParse(payload).success).toBe(true);
    expect(StartAgentSessionPayloadSchema.safeParse({ ...payload, idempotencyKey: undefined }).success)
      .toBe(false);
  });

  it('parses an approval record with a pending decision', () => {
    const result = ApprovalRecordSchema.safeParse(validApproval);

    expect(result.success).toBe(true);
  });

  it('enforces approval state, decision and decision-audit invariants', () => {
    expect(
      ApprovalRecordSchema.safeParse({
        ...validApproval,
        state: 'APPROVED',
        decision: 'APPROVE',
        decidedBy: { kind: 'CEO' },
        decidedAt: now
      }).success
    ).toBe(true);
    expect(
      ApprovalRecordSchema.safeParse({
        ...validApproval,
        state: 'REJECTED',
        decision: 'REJECT',
        decidedBy: { kind: 'CEO' },
        decidedAt: now
      }).success
    ).toBe(true);
    expect(ApprovalRecordSchema.safeParse({ ...validApproval, state: 'APPROVED' }).success).toBe(false);
    expect(
      ApprovalRecordSchema.safeParse({
        ...validApproval,
        state: 'REJECTED',
        decision: 'APPROVE',
        decidedBy: { kind: 'CEO' },
        decidedAt: now
      }).success
    ).toBe(false);
    expect(
      ApprovalRecordSchema.safeParse({
        ...validApproval,
        state: 'PENDING',
        decidedBy: { kind: 'CEO' },
        decidedAt: now
      }).success
    ).toBe(false);
    expect(
      ApprovalRecordSchema.safeParse({
        ...validApproval,
        state: 'EXPIRED',
        decision: null,
        decidedBy: { kind: 'SYSTEM', name: 'approval-expirer' },
        decidedAt: now
      }).success
    ).toBe(true);
    expect(
      ApprovalRecordSchema.safeParse({
        ...validApproval,
        state: 'CANCELLED',
        decision: null,
        decidedBy: { kind: 'CEO' },
        decidedAt: now
      }).success
    ).toBe(true);
    expect(ApprovalRecordSchema.safeParse({ ...validApproval, correlationId: undefined }).success).toBe(false);
    expect(ApprovalRecordSchema.safeParse({ ...validApproval, causationId: null }).success).toBe(false);
  });

  it('validates malformed data through the public contracts entrypoint', async () => {
    const contracts = await import('./index');

    expect(contracts.TaskSchema.safeParse({ ...validTask, traceId: null }).success).toBe(false);
    expect(
      contracts.DomainEventSchema.safeParse({
        eventId: eventId('event-public-1'),
        aggregateType: 'TASK',
        aggregateId: taskId('task-1'),
        aggregateVersion: 1,
        eventType: 'TASK_COMPLETED',
        actor: { kind: 'SYSTEM', name: 'orchestrator' },
        correlationId: correlationId('correlation-1'),
        causationId: eventId('event-0'),
        occurredAt: now,
        payload: {}
      }).success
    ).toBe(false);
  });
});
