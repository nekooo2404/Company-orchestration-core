import { type AgentSessionId } from '@aicompany/contracts';
import type { AgentCheckpoint, CheckpointStore } from '@aicompany/orchestration-core';
export declare class FileCheckpointStore implements CheckpointStore {
    private readonly filePath;
    private tail;
    constructor(filePath: string);
    save(input: AgentCheckpoint): Promise<void>;
    latest(sessionId: AgentSessionId): Promise<AgentCheckpoint | null>;
    private validate;
    private readAll;
    private writeAll;
    private serialize;
}
//# sourceMappingURL=checkpoint-store.d.ts.map