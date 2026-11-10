import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type AgentRole = 'CEO' | 'Dev' | 'QA' | 'Reviewer' | 'Analyst';
export interface AgentProfile { id: string; name: string; role: AgentRole; department: string; endpointId: string; accessRoots: string[]; terminal: 'READY' | 'RUNNING' | 'OFFLINE'; }
export interface AgentProfileStore { list(): Promise<AgentProfile[]>; get(id: string): Promise<AgentProfile | null>; save(profile: AgentProfile): Promise<void>; }

const clone = <T>(value: T): T => structuredClone(value);
const read = async (path: string): Promise<Record<string, AgentProfile>> => { try { return JSON.parse(await readFile(path, 'utf8')) as Record<string, AgentProfile>; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; } };
const write = async (path: string, value: unknown): Promise<void> => { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.tmp-${process.pid}`; await writeFile(temporary, JSON.stringify(value), 'utf8'); await rename(temporary, path); };

export class FileAgentProfileStore implements AgentProfileStore {
  public constructor(private readonly path: string) {}
  public async list(): Promise<AgentProfile[]> { return Object.values(await read(this.path)).map(clone); }
  public async get(id: string): Promise<AgentProfile | null> { const value = (await read(this.path))[id]; return value ? clone(value) : null; }
  public async save(profile: AgentProfile): Promise<void> { const state = await read(this.path); state[profile.id] = clone(profile); await write(this.path, state); }
}

export class InMemoryAgentProfileStore extends FileAgentProfileStore {
  private readonly profiles = new Map<string, AgentProfile>();
  public constructor(initial: readonly AgentProfile[] = []) { super(''); for (const profile of initial) this.profiles.set(profile.id, clone(profile)); }
  public override async list(): Promise<AgentProfile[]> { return [...this.profiles.values()].map(clone); }
  public override async get(id: string): Promise<AgentProfile | null> { const profile = this.profiles.get(id); return profile ? clone(profile) : null; }
  public override async save(profile: AgentProfile): Promise<void> { this.profiles.set(profile.id, clone(profile)); }
}
