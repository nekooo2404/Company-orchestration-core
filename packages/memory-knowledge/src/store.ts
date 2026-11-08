import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ActorRefSchema, type ActorRef } from '@aicompany/contracts';
import type { MemoryAccessPolicy, MemoryItem, MemoryQuery, MemoryStore } from './types.js';

const clone = <T>(value: T): T => structuredClone(value);
const tokenise = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9_-]+/i).filter(Boolean);
const defaultPolicy: MemoryAccessPolicy = {
  canRead: (item, actor, projectId) => {
    if (item.projectId !== projectId && item.scope !== 'COMPANY') return false;
    if (item.scope === 'COMPANY') return actor.kind === 'CEO';
    if (item.scope === 'PRIVATE') return actor.kind === 'AGENT' && item.ownerSessionId === actor.sessionId;
    return actor.kind === 'CEO' || actor.kind === 'AGENT';
  },
  canWrite: (scope, actor, projectId, ownerSessionId) => {
    if (scope === 'COMPANY') return actor.kind === 'CEO';
    if (scope === 'PROJECT') return actor.kind === 'CEO' || actor.kind === 'AGENT';
    return actor.kind === 'AGENT' && ownerSessionId === actor.sessionId && Boolean(projectId);
  }
};

export class FileMemoryStore implements MemoryStore {
  private tail: Promise<void> = Promise.resolve();

  public constructor(private readonly filePath: string, private readonly policy: MemoryAccessPolicy = defaultPolicy, private readonly now: () => Date = () => new Date()) {}

  public async write(input: Omit<MemoryItem, 'memoryId' | 'version' | 'state' | 'createdAt' | 'updatedAt'> & { memoryId?: string }): Promise<MemoryItem> {
    const actor = ActorRefSchema.parse(input.author);
    if (!input.content.trim() || !input.sourceReference.trim() || input.confidence < 0 || input.confidence > 1) throw new Error('Memory content, provenance and confidence are required');
    if (!this.policy.canWrite(input.scope, actor, input.projectId, input.ownerSessionId)) throw new Error('Memory write is not authorized');
    return this.serialize(async () => {
      const state = await this.read(); const now = this.now(); const memory: MemoryItem = { ...input, ...(input.memoryId ? { memoryId: input.memoryId } : { memoryId: `memory-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` }), author: actor, version: 1, state: 'ACTIVE', createdAt: now, updatedAt: now };
      state[memory.memoryId] = memory; await this.writeAll(state); return clone(memory);
    });
  }

  public async retrieve(query: MemoryQuery): Promise<MemoryItem[]> {
    const terms = new Set(tokenise(query.text));
    const items = Object.values(await this.read()).filter((item) => item.state === 'ACTIVE' && query.scopes.includes(item.scope) && this.policy.canRead(item, query.actor, query.projectId));
    return items.map((item) => ({ item, score: terms.size === 0 ? 0 : tokenise(item.content).filter((term) => terms.has(term)).length })).filter(({ score }) => terms.size === 0 || score > 0).sort((left, right) => right.score - left.score || right.item.updatedAt.getTime() - left.item.updatedAt.getTime()).slice(0, query.limit).map(({ item }) => clone(item));
  }

  public async promote(memoryId: string, targetScope: 'PROJECT' | 'COMPANY', actor: ActorRef, expectedVersion: number): Promise<MemoryItem> {
    if (actor.kind !== 'CEO') throw new Error('Only CEO may promote memory');
    return this.mutate(memoryId, expectedVersion, (item) => ({ ...item, scope: targetScope, version: item.version + 1, updatedAt: this.now(), promotedFrom: item.memoryId }));
  }

  public async revoke(memoryId: string, actor: ActorRef, expectedVersion: number): Promise<MemoryItem> {
    if (actor.kind !== 'CEO' && !(actor.kind === 'AGENT' && (await this.require(memoryId)).ownerSessionId === actor.sessionId)) throw new Error('Memory revoke is not authorized');
    return this.mutate(memoryId, expectedVersion, (item) => ({ ...item, state: 'REVOKED', version: item.version + 1, updatedAt: this.now() }));
  }

  private async require(memoryId: string): Promise<MemoryItem> { const item = (await this.read())[memoryId]; if (!item) throw new Error('Memory item was not found'); return item; }
  private async mutate(memoryId: string, expectedVersion: number, change: (item: MemoryItem) => MemoryItem): Promise<MemoryItem> { return this.serialize(async () => { const state = await this.read(); const current = state[memoryId]; if (!current) throw new Error('Memory item was not found'); if (current.version !== expectedVersion) throw new Error('Memory version conflict'); const next = change(current); state[memoryId] = next; await this.writeAll(state); return clone(next); }); }
  private async read(): Promise<Record<string, MemoryItem>> { try { return JSON.parse(await readFile(this.filePath, 'utf8'), (_key, value) => ['createdAt', 'updatedAt'].includes(_key) && typeof value === 'string' ? new Date(value) : value) as Record<string, MemoryItem>; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; } }
  private async writeAll(state: Record<string, MemoryItem>): Promise<void> { await mkdir(dirname(this.filePath), { recursive: true }); const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`; await writeFile(temporary, JSON.stringify(state), { flag: 'wx' }); await rename(temporary, this.filePath); }
  private async serialize<T>(operation: () => Promise<T>): Promise<T> { const previous = this.tail; let release!: () => void; this.tail = new Promise<void>((resolve) => { release = resolve; }); await previous; try { return await operation(); } finally { release(); } }
}

export { defaultPolicy as DEFAULT_MEMORY_ACCESS_POLICY };
