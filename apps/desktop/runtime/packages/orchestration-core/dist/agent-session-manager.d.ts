import { eventId, type AgentDefinitionId, type AgentSession, type AgentSessionId, type CorrelationId, type TaskId } from '@aicompany/contracts';
import type { Clock } from './leases.js';
import type { CheckpointStore, AgentCheckpoint, AgentCheckpointState } from './checkpoints.js';
import { type AgentSessionRepository, type SessionLifecyclePersistence, type WorkflowStatusReader } from './session-commands.js';
import type { TaskRepository } from './repository.js';
import type { DispatchClaimStore } from './ports.js';
import type { AgentSessionLauncher, LaunchAgentSessionInput } from './dispatch.js';
export interface StartSessionInput {
    taskId: TaskId;
    leaseId: string;
    agentDefinitionId: AgentDefinitionId;
    correlationId: CorrelationId;
    expectedTaskVersion: number;
    idempotencyKey: string;
}
export interface SaveCheckpointInput {
    sessionId: AgentSessionId;
    expectedSequence: number;
    state: AgentCheckpointState;
    contextReference: string;
    lastEventId: ReturnType<typeof eventId>;
    completedOperationKeys: string[];
    expectedSessionVersion: number;
    idempotencyKey: string;
}
export interface LifecycleCommandOptions {
    expectedVersion: number;
    idempotencyKey: string;
}
export interface ResumeSessionOptions extends LifecycleCommandOptions {
    attempt: number;
}
export interface AgentSessionManager {
    start(input: StartSessionInput): Promise<AgentSession>;
    checkpoint(input: SaveCheckpointInput): Promise<AgentCheckpoint>;
    resume(sessionId: AgentSessionId, options: ResumeSessionOptions): Promise<AgentSession>;
    pause(sessionId: AgentSessionId, reason: string, options?: LifecycleCommandOptions): Promise<void>;
    cancel(sessionId: AgentSessionId, reason: string, options?: LifecycleCommandOptions): Promise<void>;
}
export interface AgentSessionManagerOptions {
    taskRepository: TaskRepository;
    sessionRepository: AgentSessionRepository;
    checkpointStore: CheckpointStore;
    lifecyclePersistence: SessionLifecyclePersistence;
    dispatchClaims: DispatchClaimStore;
    workflowStatus: WorkflowStatusReader;
    clock: Clock;
    idFactory?: (attempt: number) => AgentSessionId;
    eventIdFactory?: () => ReturnType<typeof eventId>;
    hasPendingCleanup?: (sessionId: AgentSessionId) => boolean | Promise<boolean>;
}
export declare class AgentSessionManagerService implements AgentSessionManager {
    private readonly options;
    private nextSession;
    private nextEvent;
    constructor(options: AgentSessionManagerOptions);
    start(input: StartSessionInput): Promise<AgentSession>;
    checkpoint(input: SaveCheckpointInput): Promise<AgentCheckpoint>;
    resume(sessionId: AgentSessionId, options: ResumeSessionOptions): Promise<AgentSession>;
    pause(sessionId: AgentSessionId, reason: string, options: LifecycleCommandOptions): Promise<void>;
    cancel(sessionId: AgentSessionId, reason: string, options: LifecycleCommandOptions): Promise<void>;
    private requireSession;
    private newSessionId;
    private startFingerprint;
    private validateLifecycleOptions;
    private newEventId;
}
export declare class SessionManagerLauncher implements AgentSessionLauncher {
    private readonly manager;
    readonly persistsStart = true;
    constructor(manager: AgentSessionManager);
    launch(input: LaunchAgentSessionInput): Promise<AgentSession>;
    stop(): Promise<void>;
}
//# sourceMappingURL=agent-session-manager.d.ts.map