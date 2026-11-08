import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { AgentSessionSchema, AgentSessionIdSchema, TaskIdSchema, type AgentSession, type AgentSessionId, type TaskId } from '@aicompany/contracts';
import type { AgentSessionRepository } from '@aicompany/orchestration-core';

interface State {
  sessions: Record<string, AgentSession>;
  idempotency: Record<string, AgentSessionId>;
  fingerprints: Record<string, string>;
}

export class FileAgentSessionRepository implements AgentSessionRepository {
  private tail: Promise<void> = Promise.resolve();
  private stateCache: State | null = null;

  public constructor(private readonly filePath: string) {}

  public async get(sessionId: AgentSessionId): Promise<AgentSession | null> {
    const state = await this.read();
    const session = state.sessions[AgentSessionIdSchema.parse(sessionId)];
    return session ? structuredClone(session) : null;
  }

  public async findByTask(taskId: TaskId, idempotencyKey: string): Promise<AgentSession | null> {
    const state = await this.read();
    const sessionId = state.idempotency[`${TaskIdSchema.parse(taskId)}:${idempotencyKey}`];
    return sessionId ? structuredClone(state.sessions[sessionId] ?? null) : null;
  }

  public startFingerprint(taskId: TaskId, idempotencyKey: string): string | null {
    return this.stateCache?.fingerprints[`${TaskIdSchema.parse(taskId)}:${idempotencyKey}`] ?? null;
  }

  public async save(input: AgentSession, expectedVersion: number): Promise<void> {
    await this.serialize(async () => {
      const state = await this.read();
      const session = AgentSessionSchema.parse(input);
      const existing = state.sessions[session.sessionId];
      if (!existing && (expectedVersion !== 0 || session.version !== 0)) throw new Error('New session must start at version 0');
      if (existing && (existing.version !== expectedVersion || session.version !== expectedVersion + 1)) throw new Error('Session version conflict');
      state.sessions[session.sessionId] = session;
      await this.write(state);
    });
  }

  public async bindStart(taskId: TaskId, key: string, session: AgentSession, fingerprint: string): Promise<void> {
    await this.serialize(async () => {
      const state = await this.read();
      state.idempotency[`${TaskIdSchema.parse(taskId)}:${key}`] = session.sessionId;
      state.fingerprints[`${TaskIdSchema.parse(taskId)}:${key}`] = fingerprint;
      await this.write(state);
    });
  }

  private async read(): Promise<State> {
    try {
      const state = JSON.parse(await readFile(this.filePath, 'utf8'), (_key, value) => {
        if (['createdAt', 'updatedAt'].includes(_key) && typeof value === 'string') return new Date(value);
        return value;
      }) as State;
      this.stateCache = state;
      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const state = { sessions: {}, idempotency: {}, fingerprints: {} };
        this.stateCache = state;
        return state;
      }
      throw error;
    }
  }

  private async write(value: State): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporary, JSON.stringify(value), { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, this.filePath);
    this.stateCache = value;
  }

  private async serialize(operation: () => Promise<void>): Promise<void> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { await operation(); } finally { release(); }
  }
}
