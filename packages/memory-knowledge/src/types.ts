import type { ActorRef } from '@aicompany/contracts';

export type MemoryScope = 'PRIVATE' | 'PROJECT' | 'COMPANY';
export type MemoryState = 'ACTIVE' | 'REVOKED';

export interface MemoryItem {
  memoryId: string;
  scope: MemoryScope;
  projectId: string;
  ownerSessionId?: string;
  content: string;
  sourceReference: string;
  author: ActorRef;
  confidence: number;
  version: number;
  state: MemoryState;
  createdAt: Date;
  updatedAt: Date;
  promotedFrom?: string;
}

export interface MemoryQuery {
  actor: ActorRef;
  projectId: string;
  text: string;
  scopes: readonly MemoryScope[];
  limit: number;
}

export interface MemoryAccessPolicy {
  canRead(item: MemoryItem, actor: ActorRef, projectId: string): boolean;
  canWrite(scope: MemoryScope, actor: ActorRef, projectId: string, ownerSessionId?: string): boolean;
}

export interface MemoryStore {
  write(input: Omit<MemoryItem, 'memoryId' | 'version' | 'state' | 'createdAt' | 'updatedAt'> & { memoryId?: string }): Promise<MemoryItem>;
  retrieve(query: MemoryQuery): Promise<MemoryItem[]>;
  promote(memoryId: string, targetScope: 'PROJECT' | 'COMPANY', actor: ActorRef, expectedVersion: number): Promise<MemoryItem>;
  revoke(memoryId: string, actor: ActorRef, expectedVersion: number): Promise<MemoryItem>;
}
