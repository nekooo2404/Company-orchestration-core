import { type AgentDefinitionId, type AgentSession, type AgentSessionId, type CorrelationId, type Task, type TaskId } from '@aicompany/contracts';
import type { RecoveryCoordinator, RecoveryEventConsumer } from './recovery.js';
import type { Clock, Lease } from './leases.js';
import type { DispatchClaim, Outbox, TransactionalPersistence } from './ports.js';
export interface LaunchAgentSessionInput {
    taskId: TaskId;
    workflowId: Task['workflowId'];
    agentDefinitionId: AgentDefinitionId;
    leaseId: string;
    sessionId: AgentSessionId;
    expectedTaskVersion: number;
    idempotencyKey: AgentSessionId;
    correlationId: CorrelationId;
}
export interface AgentSessionLauncher {
    readonly persistsStart?: boolean;
    launch(input: LaunchAgentSessionInput): Promise<AgentSession>;
    stop(sessionId: AgentSessionId, reason: string): Promise<void>;
}
export interface DispatchDecision {
    taskId: TaskId;
    agentDefinitionId: AgentDefinitionId;
    leaseId: string;
    expiresAt: Date;
    correlationId: CorrelationId;
}
export type DispatchRecoveryCoordinator = Pick<RecoveryCoordinator, 'start'> & Partial<Pick<RecoveryEventConsumer, 'handleTaskEvent'>>;
export interface DispatchOptions {
    transactionalPersistence: TransactionalPersistence;
    outbox?: Outbox;
    launcher: AgentSessionLauncher;
    clock: Clock;
    recoveryCoordinator?: DispatchRecoveryCoordinator;
}
export interface DispatchTaskInput {
    task: Task;
    agentDefinitionId: AgentDefinitionId;
    lease: Lease;
    sessionId: AgentSessionId;
    claim?: DispatchClaim;
}
export interface DispatchResult {
    decision: DispatchDecision | null;
    releaseClaim: boolean;
}
export declare class TaskDispatcher {
    private readonly options;
    constructor(options: DispatchOptions);
    dispatch(input: DispatchTaskInput): Promise<DispatchResult>;
    private persistFailure;
}
//# sourceMappingURL=dispatch.d.ts.map