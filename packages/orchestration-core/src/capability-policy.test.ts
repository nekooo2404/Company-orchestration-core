import { describe, expect, it } from 'vitest';
import {
  agentSessionId,
  approvalId,
  correlationId,
  eventId,
  taskId,
  type ApprovalRecord,
  type ActorRef
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

const request = (capability: string, resource = 'repo:main', requestActor: ActorRef = actor): CapabilityRequest => ({
  actor: requestActor,
  taskId: task,
  capability,
  resource,
  correlationId: correlationId('trace-1')
});

const approval = (state: ApprovalRecord['state']): ApprovalRecord => state === 'PENDING'
  ? {
    approvalId: approvalId('approval-capability'), subjectType: 'CAPABILITY',
    subjectId: 'capability:task-1:secret.use:vault:prod', reason: 'Use secret.use on vault:prod',
    requestedBy: actor, correlationId: correlationId('trace-1'), causationId: eventId('approval-request'),
    version: 0, createdAt: now, updatedAt: now, state, decision: null, decisionReason: null,
    decidedBy: null, decidedAt: null
  }
  : {
    approvalId: approvalId('approval-capability'), subjectType: 'CAPABILITY',
    subjectId: 'capability:task-1:secret.use:vault:prod', reason: 'Use secret.use on vault:prod',
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

describe('InMemoryCapabilityPolicy', () => {
  it('allows only capabilities mapped to a known agent session role', async () => {
    const policy = new InMemoryCapabilityPolicy({ actorRoles: new Map([[session, 'engineer']]) });
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
      actorRoles: new Map([[session, 'engineer']]),
      approvalService: gateway
    });
    const result = await policy.evaluate(request('secret.use', 'vault:prod'));
    expect(result).toMatchObject({ allowed: true, requiresApproval: false, approvalId: 'approval-capability' });
    expect(gateway.requests).toHaveLength(1);
    expect(gateway.requests[0]).toMatchObject({
      subjectType: 'CAPABILITY',
      subjectId: 'capability:task-1:secret.use:vault:prod',
      reason: 'Use secret.use on vault:prod',
      requestedBy: actor,
      correlationId: correlationId('trace-1'),
      idempotencyKey: 'capability:task-1:secret.use:vault:prod'
    });
  });

  it('does not allow a capability until the verified approval record is approved', async () => {
    const pending = new ApprovalGateway(approval('PENDING'));
    const policy = new InMemoryCapabilityPolicy({
      actorRoles: new Map([[session, 'engineer']]), approvalService: pending
    });
    await expect(policy.evaluate(request('secret.use', 'vault:prod'))).resolves.toMatchObject({
      allowed: false, requiresApproval: true, approvalId: 'approval-capability'
    });

    pending.record = approval('REJECTED');
    await expect(policy.evaluate(request('secret.use', 'vault:prod'))).resolves.toMatchObject({
      allowed: false, requiresApproval: true
    });
  });

  it('does not grant capabilities to a CEO actor through agent role defaults', async () => {
    const policy = new InMemoryCapabilityPolicy({ actorRoles: new Map([[session, 'engineer']]) });
    await expect(policy.evaluate(request('repo.read', 'repo:main', { kind: 'CEO' })))
      .resolves.toMatchObject({ allowed: false });
    expect(DEFAULT_CAPABILITY_POLICY.version).toBeGreaterThan(0);
  });
});
