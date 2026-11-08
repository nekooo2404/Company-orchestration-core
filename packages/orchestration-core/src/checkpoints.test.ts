import { describe, expect, it } from 'vitest';
import { agentSessionId, eventId, taskId } from '@aicompany/contracts';
import { InMemoryCheckpointStore } from './checkpoints';

describe('checkpoint store', () => {
  it('enforces monotonic sequence and clones stored checkpoints', async () => {
    const store = new InMemoryCheckpointStore();
    const base = { sessionId: agentSessionId('s1'), taskId: taskId('t1'), state: 'RUNNING' as const, contextReference: 'ctx', lastEventId: eventId('e1'), completedOperationKeys: ['op1'], createdAt: new Date() };
    await store.save({ ...base, sequence: 1 });
    await expect(store.save({ ...base, sequence: 1 })).rejects.toThrow();
    await expect(store.save({ ...base, sequence: 0 })).rejects.toThrow();
    await store.save({ ...base, sequence: 2 });
    const loaded = await store.latest(base.sessionId);
    expect(loaded?.sequence).toBe(2);
    expect(loaded).not.toBe(await store.latest(base.sessionId));
  });
});
