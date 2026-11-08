import {
  ActorRefSchema,
  ApprovalIdSchema,
  CorrelationIdSchema,
  TaskIdSchema,
  type ActorRef,
  type ApprovalId,
  type CorrelationId,
  type TaskId
} from '@aicompany/contracts';
import type { ApprovalService, ApprovalRequest } from './approvals';

export interface CapabilityRequest {
  actor: ActorRef;
  taskId: TaskId;
  capability: string;
  resource: string;
  correlationId: CorrelationId;
}

export interface CapabilityDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
  approvalId?: ApprovalId;
}

export interface CapabilityPolicy {
  evaluate(request: CapabilityRequest): Promise<CapabilityDecision>;
}

export const DEFAULT_CAPABILITY_POLICY = Object.freeze({
  version: 1,
  roles: Object.freeze({
    engineer: Object.freeze(['repo.read', 'test.run']),
    analyst: Object.freeze(['repo.read']),
    reviewer: Object.freeze(['repo.read', 'test.run'])
  }),
  approvalRequired: Object.freeze([
    'security.scan',
    'security.write',
    'secret.use',
    'deploy.staging',
    'deploy.production'
  ])
});

type ApprovalGateway = Pick<ApprovalService, 'request' | 'get'>;

const sameActor = (left: ActorRef, right: ActorRef): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export class InMemoryCapabilityPolicy implements CapabilityPolicy {
  public constructor(private readonly options: {
    actorRoles?: ReadonlyMap<string, string>;
    approvalService?: ApprovalGateway;
    policy?: typeof DEFAULT_CAPABILITY_POLICY;
  } = {}) {}

  public async evaluate(request: CapabilityRequest): Promise<CapabilityDecision> {
    const actor = ActorRefSchema.parse(request.actor);
    const taskId = TaskIdSchema.parse(request.taskId);
    const correlationId = CorrelationIdSchema.parse(request.correlationId);
    const capability = request.capability.trim();
    const resource = request.resource.trim();
    if (!capability || !resource) throw new Error('Capability and resource are required');

    const policy = this.options.policy ?? DEFAULT_CAPABILITY_POLICY;
    const role = actor.kind === 'AGENT' ? this.options.actorRoles?.get(actor.sessionId) : undefined;
    const grants = role === undefined ? undefined : policy.roles[role as keyof typeof policy.roles];
    if (actor.kind === 'AGENT' && (role === undefined || grants === undefined)) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: 'Agent session has no mapped role'
      };
    }
    if (grants?.includes(capability)) {
      return {
        allowed: true,
        requiresApproval: false,
        reason: `Allowed by ${role} defaults (policy v${policy.version})`
      };
    }

    if (!policy.approvalRequired.includes(capability)) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: `Capability ${capability} is not granted by policy v${policy.version}`
      };
    }

    const subjectId = `capability:${taskId}:${capability}:${resource}`;
    const reason = `Use ${capability} on ${resource}`;
    const idempotencyKey = subjectId;
    if (this.options.approvalService === undefined) {
      return { allowed: false, requiresApproval: true, reason: 'CEO approval is required' };
    }

    const requestInput: ApprovalRequest = {
      subjectType: 'CAPABILITY',
      subjectId,
      reason,
      requestedBy: actor,
      correlationId,
      idempotencyKey
    };
    const requested = await this.options.approvalService.request(requestInput);
    const approval = await this.options.approvalService.get(requested.approvalId);
    const verified = approval.approvalId === requested.approvalId
      && approval.subjectType === 'CAPABILITY'
      && approval.subjectId === subjectId
      && approval.reason === reason
      && sameActor(approval.requestedBy, actor)
      && approval.state === 'APPROVED'
      && approval.decision === 'APPROVE';
    if (verified) {
      return {
        allowed: true,
        requiresApproval: false,
        reason: 'Capability approved by CEO',
        approvalId: ApprovalIdSchema.parse(approval.approvalId)
      };
    }

    return {
      allowed: false,
      requiresApproval: true,
      reason: approval.state === 'REJECTED' ? 'CEO rejected the capability request' : 'CEO approval is required',
      approvalId: ApprovalIdSchema.parse(approval.approvalId)
    };
  }
}
