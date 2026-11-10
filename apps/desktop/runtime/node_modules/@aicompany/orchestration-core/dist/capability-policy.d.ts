import { type ActorRef, type ApprovalId, type CorrelationId, type TaskId } from '@aicompany/contracts';
import type { ApprovalService } from './approvals.js';
import type { AgentSessionRepository } from './session-commands.js';
import type { TaskRepository } from './repository.js';
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
export declare const DEFAULT_CAPABILITY_POLICY: Readonly<{
    version: 1;
    roles: Readonly<{
        engineer: readonly string[];
        analyst: readonly string[];
        reviewer: readonly string[];
    }>;
    approvalRequired: readonly string[];
}>;
type ApprovalGateway = Pick<ApprovalService, 'request' | 'get'>;
export declare class InMemoryCapabilityPolicy implements CapabilityPolicy {
    private readonly options;
    constructor(options?: {
        actorRoles?: ReadonlyMap<string, string>;
        sessionRepository?: Pick<AgentSessionRepository, 'get'>;
        taskRepository?: Pick<TaskRepository, 'get'>;
        resourceScopes?: ReadonlyMap<string, readonly string[]>;
        approvalService?: ApprovalGateway;
        policy?: typeof DEFAULT_CAPABILITY_POLICY;
    });
    evaluate(request: CapabilityRequest): Promise<CapabilityDecision>;
}
export {};
//# sourceMappingURL=capability-policy.d.ts.map