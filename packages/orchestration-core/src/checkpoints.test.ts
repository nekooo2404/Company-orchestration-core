import { describe, expect, it } from 'vitest';
import { agentSessionId, eventId, taskId } from '@aicompany/contracts';
import { InMemoryCheckpointStore } from './checkpoints';

describe('checkpoint store', () => {
  it('unions completed keys and rejects a write after completion', async () => {
    const store = new InMemoryCheckpointStore();
    const base = { sessionId: agentSessionId('s2'), taskId: taskId('t2'),
      contextReference: 'ctx', lastEventId: eventId('e1'), createdAt: new Date() };
    await store.save({ ...base, sequence: 1, state: 'RUNNING', completedOperationKeys: ['charged'] });
    await store.save({ ...base, sequence: 2, state: 'COMPLETED', completedOperationKeys: ['published'] });
    expect((await store.latest(base.sessionId))?.completedOperationKeys).toEqual(['charged', 'published']);
    await expect(store.save({ ...base, sequence: 3, state: 'RUNNING', completedOperationKeys: [] }))
      .rejects.toThrow(/terminal|completed/i);
  });
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
