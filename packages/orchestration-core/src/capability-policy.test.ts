import { describe, expect, it } from 'vitest';
import {
  agentDefinitionId,
  agentSessionId,
  approvalId,
  correlationId,
  eventId,
  workflowId,
  taskId,
  type ApprovalRecord,
  type ActorRef,
  type Task,
  type AgentSession
} from '@aicompany/contracts';
import {
  DEFAULT_CAPABILITY_POLICY,
  InMemoryCapabilityPolicy,
  type CapabilityRequest
} from './capability-policy';
import type { ApprovalRequest } from './approvals';

const now = new Date('2026-11-08T00:00:00.000Z');
const task = taskId('task-1');
const session = agentSessionId('session-1');
const actor: ActorRef = { kind: 'AGENT', sessionId: session };

const request = (capability: string, resource = 'project:project-1:repo:main', requestActor: ActorRef = actor): CapabilityRequest => ({
  actor: requestActor,
  taskId: task,
  capability,
  resource,
  correlationId: correlationId('trace-1')
});

const approval = (state: ApprovalRecord['state']): ApprovalRecord => state === 'PENDING'
  ? {
    approvalId: approvalId('approval-capability'), subjectType: 'CAPABILITY',
    subjectId: 'capability:task-1:secret.use:project:project-1:vault:prod', reason: 'Use secret.use on project:project-1:vault:prod',
    requestedBy: actor, correlationId: correlationId('trace-1'), causationId: eventId('approval-request'),
    version: 0, createdAt: now, updatedAt: now, state, decision: null, decisionReason: null,
    decidedBy: null, decidedAt: null
  }
  : {
    approvalId: approvalId('approval-capability'), subjectType: 'CAPABILITY',
    subjectId: 'capability:task-1:secret.use:project:project-1:vault:prod', reason: 'Use secret.use on project:project-1:vault:prod',
    requestedBy: actor, correlationId: correlationId('trace-1'), causationId: eventId('approval-request'),
    version: 1, createdAt: now, updatedAt: now, state, decision: state === 'APPROVED' ? 'APPROVE' : 'REJECT',
    decisionReason: state === 'APPROVED' ? 'approved by CEO' : 'not approved',
    decidedBy: { kind: 'CEO' }, decidedAt: now
  };

class ApprovalGateway {
  public readonly requests: ApprovalRequest[] = [];
  public constructor(public record: ApprovalRecord) {}
  public async request(input: ApprovalRequest): Promise<ApprovalRecord> {
    this.requests.push(input);
    return this.record;
  }
  public async get(): Promise<ApprovalRecord> { return this.record; }
}

const assignedTask: Task = {
  id: task, workflowId: workflowId('workflow-1'), state: 'RUNNING',
  dependencyIds: [], requiredCapabilities: [], outputContract: 'output', budget: { maxTokens: 10, maxCostUsd: 1 },
  recoveryCycles: 0, projectId: 'project-1', parentTaskId: null,
  ownerAgentDefinitionId: agentDefinitionId('agent-1'), deadline: null, traceId: correlationId('trace-1'),
  version: 1, createdAt: now, updatedAt: now
};
const activeSession: AgentSession = {
  sessionId: session, taskId: task, workflowId: assignedTask.workflowId,
  agentDefinitionId: agentDefinitionId('agent-1'), state: 'RUNNING', contextReference: 'ctx',
  checkpointReference: null, traceId: assignedTask.traceId,
  usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, toolCallHistory: [],
  attempt: 1, version: 0, createdAt: now, updatedAt: now
};
const scope = (overrides: { task?: Task; session?: AgentSession } = {}) => ({
  taskRepository: { get: async () => overrides.task ?? assignedTask },
  sessionRepository: { get: async () => overrides.session ?? activeSession },
  resourceScopes: new Map([[session, ['project:project-1:repo:main', 'project:project-1:vault:prod']]])
});

describe('InMemoryCapabilityPolicy', () => {
  it('allows only capabilities mapped to a known agent session role', async () => {
    const policy = new InMemoryCapabilityPolicy({ actorRoles: new Map([[session, 'engineer']]), ...scope() });
    await expect(policy.evaluate(request('repo.read'))).resolves.toMatchObject({ allowed: true, requiresApproval: false });
    await expect(policy.evaluate(request('repo.write'))).resolves.toMatchObject({ allowed: false, requiresApproval: false });
    await expect(new InMemoryCapabilityPolicy().evaluate(request('repo.read')))
      .resolves.toMatchObject({ allowed: false, requiresApproval: false });
    const unknownApprovalRequest = new InMemoryCapabilityPolicy({
      approvalService: new ApprovalGateway(approval('APPROVED'))
    });
    await expect(unknownApprovalRequest.evaluate(request('secret.use', 'vault:prod')))
      .resolves.toMatchObject({ allowed: false, requiresApproval: false });
  });

  it('routes approval-required capability and resource requests through an approval service', async () => {
    const gateway = new ApprovalGateway(approval('APPROVED'));
    const policy = new InMemoryCapabilityPolicy({
      ...scope(),
      actorRoles: new Map([[session, 'engineer']]),
      approvalService: gateway
    });
    const result = await policy.evaluate(request('secret.use', 'project:project-1:vault:prod'));
    expect(result).toMatchObject({ allowed: true, requiresApproval: false, approvalId: 'approval-capability' });
    expect(gateway.requests).toHaveLength(1);
    expect(gateway.requests[0]).toMatchObject({
      subjectType: 'CAPABILITY',
      subjectId: 'capability:task-1:secret.use:project:project-1:vault:prod',
      reason: 'Use secret.use on project:project-1:vault:prod',
      requestedBy: actor,
      correlationId: correlationId('trace-1'),
      idempotencyKey: 'capability:task-1:secret.use:project:project-1:vault:prod'
    });
  });

  it('does not allow a capability until the verified approval record is approved', async () => {
    const pending = new ApprovalGateway(approval('PENDING'));
    const policy = new InMemoryCapabilityPolicy({
      actorRoles: new Map([[session, 'engineer']]), approvalService: pending, ...scope()
    });
    await expect(policy.evaluate(request('secret.use', 'project:project-1:vault:prod'))).resolves.toMatchObject({
      allowed: false, requiresApproval: true, approvalId: 'approval-capability'
    });

    pending.record = approval('REJECTED');
    await expect(policy.evaluate(request('secret.use', 'project:project-1:vault:prod'))).resolves.toMatchObject({
      allowed: false, requiresApproval: true
    });
  });

  it('does not grant capabilities to a CEO actor through agent role defaults', async () => {
    const policy = new InMemoryCapabilityPolicy({ actorRoles: new Map([[session, 'engineer']]) });
    await expect(policy.evaluate(request('repo.read', 'repo:main', { kind: 'CEO' })))
      .resolves.toMatchObject({ allowed: false });
    expect(DEFAULT_CAPABILITY_POLICY.version).toBeGreaterThan(0);
  });

  it('denies cross-project, wrong-task and inactive sessions before approval escalation', async () => {
    const gateway = new ApprovalGateway(approval('PENDING'));
    const policy = new InMemoryCapabilityPolicy({ actorRoles: new Map([[session, 'engineer']]),
      approvalService: gateway, ...scope() });
    await expect(policy.evaluate(request('repo.read', 'project:other:repo:main')))
      .resolves.toMatchObject({ allowed: false, requiresApproval: false });
    await expect(policy.evaluate(request('repo.read', 'project:project-1:repo:other')))
      .resolves.toMatchObject({ allowed: false, requiresApproval: false });
    await expect(policy.evaluate({ ...request('secret.use', 'project:project-1:vault:prod'), taskId: taskId('other-task') }))
      .resolves.toMatchObject({ allowed: false, requiresApproval: false });
    const inactive = new InMemoryCapabilityPolicy({ actorRoles: new Map([[session, 'engineer']]),
      approvalService: gateway, ...scope({ session: { ...activeSession, state: 'CANCELLED' } }) });
    await expect(inactive.evaluate(request('secret.use', 'project:project-1:vault:prod')))
      .resolves.toMatchObject({ allowed: false, requiresApproval: false });
    expect(gateway.requests).toEqual([]);
  });
});
