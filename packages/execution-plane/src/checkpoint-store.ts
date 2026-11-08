import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { AgentSessionIdSchema, EventIdSchema, TaskIdSchema, type AgentSessionId } from '@aicompany/contracts';
import type { AgentCheckpoint, CheckpointStore } from '@aicompany/orchestration-core';

const clone = <T>(value: T): T => structuredClone(value);

export class FileCheckpointStore implements CheckpointStore {
  private tail: Promise<void> = Promise.resolve();

  public constructor(private readonly filePath: string) {}

  public async save(input: AgentCheckpoint): Promise<void> {
    await this.serialize(async () => {
      const checkpoints = await this.readAll();
      const current = checkpoints[input.sessionId];
      const parsed = this.validate(input);
      if (current && parsed.sequence !== current.sequence + 1) throw new Error('Checkpoint sequence must advance exactly one step');
      if (!current && parsed.sequence !== 1) throw new Error('First checkpoint sequence must be 1');
      if (current?.state === 'COMPLETED') throw new Error('Completed session checkpoint is terminal');
      parsed.completedOperationKeys = [...new Set([...(current?.completedOperationKeys ?? []), ...parsed.completedOperationKeys])];
      checkpoints[parsed.sessionId] = parsed;
      await this.writeAll(checkpoints);
    });
  }

  public async latest(sessionId: AgentSessionId): Promise<AgentCheckpoint | null> {
    const parsedId = AgentSessionIdSchema.parse(sessionId);
    const checkpoints = await this.readAll();
    return checkpoints[parsedId] ? clone(checkpoints[parsedId]) : null;
  }

  private validate(input: AgentCheckpoint): AgentCheckpoint {
    const checkpoint = clone(input);
    checkpoint.sessionId = AgentSessionIdSchema.parse(checkpoint.sessionId);
    checkpoint.taskId = TaskIdSchema.parse(checkpoint.taskId);
    checkpoint.lastEventId = EventIdSchema.parse(checkpoint.lastEventId);
    if (!Number.isSafeInteger(checkpoint.sequence) || checkpoint.sequence < 1 || !checkpoint.contextReference.trim()) throw new Error('Invalid checkpoint');
    return checkpoint;
  }

  private async readAll(): Promise<Record<string, AgentCheckpoint>> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8'), (_key, value) => {
        if (_key === 'createdAt' && typeof value === 'string') return new Date(value);
        return value;
      }) as Record<string, AgentCheckpoint>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  private async writeAll(value: Record<string, AgentCheckpoint>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporary, JSON.stringify(value), { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, this.filePath);
  }

  private async serialize(operation: () => Promise<void>): Promise<void> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { await operation(); } finally { release(); }
  }
}
