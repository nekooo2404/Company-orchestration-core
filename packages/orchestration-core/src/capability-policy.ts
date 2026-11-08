import { ActorRefSchema, ApprovalIdSchema, CorrelationIdSchema, TaskIdSchema, type ActorRef, type ApprovalId, type CorrelationId, type TaskId } from '@aicompany/contracts';

export interface CapabilityRequest { actor: ActorRef; taskId: TaskId; capability: string; resource: string; correlationId: CorrelationId }
export interface CapabilityDecision { allowed: boolean; requiresApproval: boolean; reason: string; approvalId?: ApprovalId }
export interface CapabilityPolicy { evaluate(request: CapabilityRequest): Promise<CapabilityDecision> }
export interface CapabilityApprovalRequester { request(input: { capability: string; taskId: TaskId; resource: string; requestedBy: ActorRef; correlationId: CorrelationId; idempotencyKey: string }): Promise<ApprovalId> }

export const DEFAULT_CAPABILITY_POLICY = Object.freeze({
  version: 1,
  roles: Object.freeze({
    engineer: Object.freeze(['repo.read', 'test.run']),
    analyst: Object.freeze(['repo.read']),
    reviewer: Object.freeze(['repo.read', 'test.run'])
  }),
  approvalRequired: Object.freeze(['security.scan', 'security.write', 'secret.use', 'deploy.staging', 'deploy.production'])
});

export class InMemoryCapabilityPolicy implements CapabilityPolicy {
  public constructor(private readonly options: {
    actorRoles?: ReadonlyMap<string, string>;
    requestApproval?: (input: Parameters<CapabilityApprovalRequester['request']>[0]) => Promise<ApprovalId>;
    policy?: typeof DEFAULT_CAPABILITY_POLICY;
  } = {}) {}

  public async evaluate(request: CapabilityRequest): Promise<CapabilityDecision> {
    const actor = ActorRefSchema.parse(request.actor);
    const task = TaskIdSchema.parse(request.taskId);
    const correlation = CorrelationIdSchema.parse(request.correlationId);
    const capability = request.capability.trim();
    if (!capability || !request.resource.trim()) throw new Error('Capability and resource are required');
    const policy = this.options.policy ?? DEFAULT_CAPABILITY_POLICY;
    const role = actor.kind === 'AGENT' ? this.options.actorRoles?.get(actor.sessionId) ?? 'engineer' : '';
    const grants = policy.roles[role as keyof typeof policy.roles] ?? [];
    if (grants.includes(capability)) return { allowed: true, requiresApproval: false, reason: `Allowed by ${role} defaults (policy v${policy.version})` };
    if (policy.approvalRequired.includes(capability)) {
      if (!this.options.requestApproval) return { allowed: false, requiresApproval: true, reason: 'CEO approval is required' };
      const id = await this.options.requestApproval({ capability, taskId: task, resource: request.resource.trim(), requestedBy: actor, correlationId: correlation, idempotencyKey: `capability:${task}:${capability}:${request.resource.trim()}` });
      return { allowed: false, requiresApproval: true, reason: 'CEO approval is required', approvalId: ApprovalIdSchema.parse(id) };
    }
    return { allowed: false, requiresApproval: false, reason: `Capability ${capability} is not granted by policy v${policy.version}` };
  }
}
