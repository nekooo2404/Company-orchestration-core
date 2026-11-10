import { type AgentSession, type AgentSessionId, type TaskId } from '@aicompany/contracts';
import type { AgentSessionRepository } from '@aicompany/orchestration-core';
export declare class FileAgentSessionRepository implements AgentSessionRepository {
    private readonly filePath;
    private tail;
    private stateCache;
    constructor(filePath: string);
    get(sessionId: AgentSessionId): Promise<AgentSession | null>;
    findByTask(taskId: TaskId, idempotencyKey: string): Promise<AgentSession | null>;
    startFingerprint(taskId: TaskId, idempotencyKey: string): string | null;
    save(input: AgentSession, expectedVersion: number): Promise<void>;
    bindStart(taskId: TaskId, key: string, session: AgentSession, fingerprint: string): Promise<void>;
    private read;
    private write;
    private serialize;
}
//# sourceMappingURL=session-store.d.ts.map