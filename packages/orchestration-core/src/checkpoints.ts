import {
  AgentSessionIdSchema,
  EventIdSchema,
  TaskIdSchema,
  type AgentSessionId,
  type EventId,
  type TaskId
} from '@aicompany/contracts';

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

export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly checkpoints = new Map<AgentSessionId, AgentCheckpoint>();

  public async save(input: AgentCheckpoint): Promise<void> {
    const checkpoint = globalThis.structuredClone(input);
    checkpoint.sessionId = AgentSessionIdSchema.parse(checkpoint.sessionId);
    checkpoint.taskId = TaskIdSchema.parse(checkpoint.taskId);
    checkpoint.lastEventId = EventIdSchema.parse(checkpoint.lastEventId);
    if (!Number.isSafeInteger(checkpoint.sequence) || checkpoint.sequence < 1 ||
        !checkpoint.contextReference.trim() ||
        checkpoint.completedOperationKeys.some((key) => !key.trim()) ||
        Number.isNaN(checkpoint.createdAt.getTime())) {
      throw new Error('Invalid agent checkpoint');
    }
    const current = this.checkpoints.get(checkpoint.sessionId);
    if (current && checkpoint.sequence !== current.sequence + 1) {
      throw new Error(`Checkpoint sequence for ${checkpoint.sessionId} must advance from ${current.sequence} to ${current.sequence + 1}`);
    }
    if (!current && checkpoint.sequence !== 1) {
      throw new Error(`First checkpoint sequence for ${checkpoint.sessionId} must be 1`);
    }
    if (current?.state === 'COMPLETED') throw new Error('Completed session checkpoint is terminal');
    checkpoint.completedOperationKeys = [...new Set([...(current?.completedOperationKeys ?? []), ...checkpoint.completedOperationKeys])];
    this.checkpoints.set(checkpoint.sessionId, checkpoint);
  }

  public async latest(sessionId: AgentSessionId): Promise<AgentCheckpoint | null> {
    const checkpoint = this.checkpoints.get(AgentSessionIdSchema.parse(sessionId));
    return checkpoint ? globalThis.structuredClone(checkpoint) : null;
  }
}
