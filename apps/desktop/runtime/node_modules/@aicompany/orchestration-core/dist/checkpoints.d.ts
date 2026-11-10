import { type AgentSessionId, type EventId, type TaskId } from '@aicompany/contracts';
export type AgentCheckpointState = 'RUNNING' | 'PAUSED' | 'WAITING_FOR_TOOL' | 'COMPLETED';
export interface AgentCheckpoint {
    sessionId: AgentSessionId;
    taskId: TaskId;
    sequence: number;
    state: AgentCheckpointState;
    contextReference: string;
    lastEventId: EventId;
    completedOperationKeys: string[];
    createdAt: Date;
}
export interface CheckpointStore {
    save(checkpoint: AgentCheckpoint): Promise<void>;
    latest(sessionId: AgentSessionId): Promise<AgentCheckpoint | null>;
}
export declare class InMemoryCheckpointStore implements CheckpointStore {
    private readonly checkpoints;
    save(input: AgentCheckpoint): Promise<void>;
    latest(sessionId: AgentSessionId): Promise<AgentCheckpoint | null>;
}
//# sourceMappingURL=checkpoints.d.ts.map