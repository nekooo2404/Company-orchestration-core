import { describe, expect, it } from 'vitest';
import {
  correlationId,
  eventId,
  taskId,
  workflowId,
  type DomainEvent,
  type OutboxCommand,
  type Task
} from '@aicompany/contracts';
import * as orchestrationCore from './index';
import {
  DuplicatePersistenceIdError,
  InMemoryEventStore,
  InMemoryOutbox,
  InMemoryTaskRepository,
  OptimisticConcurrencyError
} from './test-support/inmemory-store';

const now = new Date('2026-11-08T00:00:00.000Z');

const makeEvent = (version: number, eventIdentifier = `event-${version}`): DomainEvent => ({
  eventId: eventId(eventIdentifier),
  aggregateType: 'TASK',
  aggregateId: 'task-1',
  aggregateVersion: version,
  eventType: 'TASK_READY',
  actor: { kind: 'SYSTEM', name: 'test' },
  correlationId: correlationId('correlation-1'),
  causationId: eventId(`cause-${version}`),
  occurredAt: now,
  payload: { taskId: taskId('task-1') }
});

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: taskId('task-1'),
  workflowId: workflowId('workflow-1'),
  state: 'PENDING',
  dependencyIds: [],
  requiredCapabilities: ['repo.read'],
  outputContract: 'validated output',
  budget: { maxTokens: 1000, maxCostUsd: 1 },
  recoveryCycles: 0,
  projectId: 'project-1',
  parentTaskId: null,
  ownerAgentDefinitionId: null,
  deadline: null,
  traceId: correlationId('trace-1'),
  version: 0,
  createdAt: now,
  updatedAt: now,
  ...overrides
});

const makeCommand = (commandIdentifier = 'command-1', overrides: Partial<OutboxCommand> = {}): OutboxCommand => ({
  commandId: commandIdentifier,
  type: 'START_RECOVERY',
  payload: { taskId: taskId('task-1'), recoveryId: 'recovery-1' },
  actor: { kind: 'SYSTEM', name: 'test' },
  issuedAt: now,
  availableAt: new Date('2026-11-07T23:59:00.000Z'),
  correlationId: correlationId('correlation-1'),
  causationId: eventId('event-1'),
  ...overrides
});

describe('in-memory persistence adapters', () => {
  it('exports the deterministic event store adapter', () => {
    expect('InMemoryEventStore' in orchestrationCore).toBe(true);
  });

  it('appends and reads an aggregate stream in version order', async () => {
    const store = new InMemoryEventStore();

    await store.append([makeEvent(1), makeEvent(2)], 0);

    expect((await store.readStream('task-1')).map((event) => event.aggregateVersion)).toEqual([1, 2]);
    expect((await store.readStream('task-1', 1)).map((event) => event.aggregateVersion)).toEqual([2]);
  });

  it('rejects an append whose expected aggregate version is stale', async () => {
    const store = new InMemoryEventStore();
    await store.append([makeEvent(1)], 0);

    await expect(store.append([makeEvent(2)], 0)).rejects.toBeInstanceOf(OptimisticConcurrencyError);
    expect((await store.readStream('task-1')).map((event) => event.aggregateVersion)).toEqual([1]);
  });

  it('treats an identical event retry as idempotent and rejects conflicting event data', async () => {
    const store = new InMemoryEventStore();
    const original = makeEvent(1, 'event-same');
    await store.append([original], 0);

    await expect(store.append([structuredClone(original)], 0)).resolves.toBeUndefined();
    await expect(
      store.append([{ ...original, payload: { taskId: taskId('task-2') } }], 0)
    ).rejects.toBeInstanceOf(DuplicatePersistenceIdError);
    await expect(store.hasEvent(eventId('event-same'))).resolves.toBe(true);
  });

  it('enforces optimistic task versions and returns workflow-scoped clones', async () => {
    const repository = new InMemoryTaskRepository();
    const task = makeTask();
    await repository.save(task, 0);

    const ready = makeTask({ state: 'READY', version: 1 });
    await repository.save(ready, 0);
    await expect(repository.save(makeTask({ version: 2 }), 0)).rejects.toBeInstanceOf(OptimisticConcurrencyError);

    const loaded = await repository.get(taskId('task-1'));
    expect(loaded).toEqual(ready);
    expect(loaded).not.toBe(ready);
    expect(await repository.listByWorkflow(workflowId('workflow-1'))).toEqual([ready]);
  });

  it('claims an outbox command once until completion and recovers stale claims', async () => {
    const clock = { value: new Date('2026-11-08T00:00:00.000Z') };
    const outbox = new InMemoryOutbox({ now: () => clock.value, leaseDurationMs: 60_000 });
    await outbox.enqueue(makeCommand('command-1'));

    const firstClaim = await outbox.claim(1, 'worker-a');
    expect(firstClaim).toHaveLength(1);
    expect(await outbox.claim(1, 'worker-b')).toEqual([]);

    await outbox.markCompleted('command-1');
    expect(await outbox.claim(1, 'worker-b')).toEqual([]);

    await outbox.enqueue(
      makeCommand('command-2', {
        claimedBy: 'old-worker',
        claimedAt: new Date('2026-11-07T23:00:00.000Z')
      })
    );
    const recoveredClaim = await outbox.claim(1, 'worker-b');
    expect(recoveredClaim.map((command) => command.commandId)).toEqual(['command-2']);
  });

  it('parses canonical contracts at persistence boundaries', async () => {
    const store = new InMemoryEventStore();
    const repository = new InMemoryTaskRepository();
    const outbox = new InMemoryOutbox();

    await expect(
      store.append([{ ...makeEvent(1), payload: {} } as unknown as DomainEvent], 0)
    ).rejects.toThrow();
    await expect(
      repository.save({ ...makeTask(), state: 'UNKNOWN' } as unknown as Task, 0)
    ).rejects.toThrow();
    await expect(
      outbox.enqueue({ ...makeCommand(), payload: {} } as unknown as OutboxCommand)
    ).rejects.toThrow();
  });
});
