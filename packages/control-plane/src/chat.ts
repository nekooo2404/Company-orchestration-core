import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface AgentChatMessage { id: string; workflowId: string; agentId: string; role: 'CEO' | 'AGENT' | 'SYSTEM'; content: string; createdAt: string; }
export interface AgentChatStore { list(workflowId: string): Promise<AgentChatMessage[]>; append(message: AgentChatMessage): Promise<void>; }
const clone = <T>(value: T): T => structuredClone(value);
export class FileAgentChatStore implements AgentChatStore {
  public constructor(private readonly path: string) {}
  public async list(workflowId: string): Promise<AgentChatMessage[]> { try { const values = JSON.parse(await readFile(this.path, 'utf8')) as AgentChatMessage[]; return values.filter((value) => value.workflowId === workflowId).map(clone); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; } }
  public async append(message: AgentChatMessage): Promise<void> { let values: AgentChatMessage[] = []; try { values = JSON.parse(await readFile(this.path, 'utf8')) as AgentChatMessage[]; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } values.push(clone(message)); await mkdir(dirname(this.path), { recursive: true }); const temporary = `${this.path}.tmp-${process.pid}`; await writeFile(temporary, JSON.stringify(values), 'utf8'); await rename(temporary, this.path); }
}
export class InMemoryAgentChatStore implements AgentChatStore {
  private readonly messages: AgentChatMessage[] = [];
  public async list(workflowId: string): Promise<AgentChatMessage[]> { return this.messages.filter((message) => message.workflowId === workflowId).map(clone); }
  public async append(message: AgentChatMessage): Promise<void> { this.messages.push(clone(message)); }
}
