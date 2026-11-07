import { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  correlationId,
  eventId,
  taskId,
  workflowId,
  type DomainEvent,
  type Task
} from '@aicompany/contracts';
import {
  InvalidPersistenceOperationError,
  type TransactionalPersistence
} from '@aicompany/orchestration-core';
import { PostgresOutbox, PostgresTaskRepository, PostgresStore } from './index';

const now = new Date('2026-11-08T00:00:00.000Z');

const makeEvent = (version: number): DomainEvent => ({
  eventId: eventId(`event-${version}`),
  aggregateType: 'TASK',
  aggregateId: 'task-1',
  aggregateVersion: version,
  eventType: 'TASK_READY',
  actor: { kind: 'SYSTEM', name: 'boundary-test' },
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

const noDatabaseAccess = (): {
  pool: Pool;
  connect: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
} => {
  const connect = vi.fn(async () => {
    throw new Error('database access should not occur');
  });
  const query = vi.fn(async () => {
    throw new Error('database access should not occur');
  });
  return { pool: { connect, query } as unknown as Pool, connect, query };
};

describe('PostgreSQL adapter boundaries', () => {
  it('rejects invalid IDs before issuing database queries', async () => {
    const database = noDatabaseAccess();
    const store = new PostgresStore(database.pool);
    const tasks = new PostgresTaskRepository(database.pool);
    const outbox = new PostgresOutbox(database.pool);

    await expect(store.readStream('   ')).rejects.toThrow();
    await expect(store.hasEvent('   ' as never)).rejects.toThrow();
    await expect(tasks.get('   ')).rejects.toThrow();
    await expect(tasks.listByWorkflow('   ')).rejects.toThrow();
    await expect(outbox.markCompleted('   ')).rejects.toThrow();
    await expect(outbox.claim(1, '   ')).rejects.toThrow();

    expect(database.connect).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
  });

  it('rejects a partial outbox lease before acquiring a database client', async () => {
    const database = noDatabaseAccess();
    const outbox = new PostgresOutbox(database.pool);

    await expect(
      outbox.enqueue({
        commandId: 'command-partial',
        type: 'START_RECOVERY',
        payload: { taskId: taskId('task-1'), recoveryId: 'recovery-1' },
        actor: { kind: 'SYSTEM', name: 'boundary-test' },
        issuedAt: now,
        availableAt: now,
        correlationId: correlationId('correlation-1'),
        causationId: eventId('event-1'),
        claimedBy: 'worker-only'
      })
    ).rejects.toBeInstanceOf(InvalidPersistenceOperationError);

    expect(database.connect).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
  });

  it('rejects atomic task/event mismatches before acquiring a database client', async () => {
    const database = noDatabaseAccess();
    const store = new PostgresStore(database.pool);
    const transactional: TransactionalPersistence = store;

    await expect(
      transactional.saveTaskAndAppend({
        task: makeTask({ id: taskId('task-2') }),
        expectedVersion: 0,
        events: [makeEvent(1)],
        commands: []
      })
    ).rejects.toBeInstanceOf(InvalidPersistenceOperationError);
    await expect(
      transactional.saveTaskAndAppend({
        task: makeTask(),
        expectedVersion: 0,
        events: [makeEvent(2)],
        commands: []
      })
    ).rejects.toBeInstanceOf(InvalidPersistenceOperationError);
    await expect(
      transactional.saveTaskAndAppend({
        task: makeTask({ version: 2 }),
        expectedVersion: 0,
        events: [makeEvent(1)],
        commands: []
      })
    ).rejects.toBeInstanceOf(InvalidPersistenceOperationError);

    expect(database.connect).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
  });
});
