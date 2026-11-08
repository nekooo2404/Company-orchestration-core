import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentSessionId } from '@aicompany/contracts';
import { FileMemoryStore } from './index';

describe('memory knowledge store', () => {
  it('filters private memory by owner and promotes only through CEO', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aicompany-memory-'));
    try {
      const store = new FileMemoryStore(join(root, 'memory.json'));
      const agent = { kind: 'AGENT' as const, sessionId: agentSessionId('session-1') };
      const ceo = { kind: 'CEO' as const };
      const item = await store.write({ scope: 'PRIVATE', projectId: 'project-1', ownerSessionId: agent.sessionId, content: 'deployment uses staging evidence', sourceReference: 'artifact://evidence-1', author: agent, confidence: 0.9 });
      await expect(store.retrieve({ actor: { kind: 'AGENT', sessionId: agentSessionId('session-2') }, projectId: 'project-1', text: 'deployment', scopes: ['PRIVATE'], limit: 10 })).resolves.toEqual([]);
      await expect(store.promote(item.memoryId, 'PROJECT', agent, 1)).rejects.toThrow(/CEO/i);
      await expect(store.promote(item.memoryId, 'PROJECT', ceo, 1)).resolves.toMatchObject({ scope: 'PROJECT', version: 2, promotedFrom: item.memoryId });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
