import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  approvalId,
  correlationId,
  eventId,
  taskId,
  workflowId,
  type DomainEvent,
  type OutboxCommand,
  type Task
} from '@aicompany/contracts';
import type {
  EventStore,
  TaskRepository,
  TransactionalPersistence
} from '@aicompany/orchestration-core';
import * as persistence from './index';

type PostgresStoreContract = EventStore & TransactionalPersistence & {
  close(): Promise<void>;
};

type PostgresOutboxContract = {
  enqueue(command: OutboxCommand): Promise<void>;
  claim(limit: number, workerId: string): Promise<OutboxCommand[]>;
  markCompleted(commandId: string): Promise<void>;
};

type PersistenceModule = {
  PostgresStore: new (pool: Pool) => PostgresStoreContract;
  PostgresTaskRepository: new (pool: Pool) => TaskRepository;
  PostgresOutbox: new (
    pool: Pool,
    options?: { leaseDurationMs?: number }
  ) => PostgresOutboxContract;
};

const moduleExports = persistence as unknown as PersistenceModule;
const runIntegration = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_TESTCONTAINERS);
const integration = runIntegration ? describe : describe.skip;
const now = new Date('2026-11-08T00:00:00.000Z');

const makeEvent = (version: number, eventIdentifier = `event-${version}`): DomainEvent => ({
  eventId: eventId(eventIdentifier),
  aggregateType: 'TASK',
  aggregateId: 'task-1',
  aggregateVersion: version,
  eventType: 'TASK_READY',
  actor: { kind: 'SYSTEM', name: 'integration-test' },
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

const makeCommand = (commandIdentifier: string, overrides: Partial<OutboxCommand> = {}): OutboxCommand => ({
  commandId: commandIdentifier,
  type: 'START_RECOVERY',
  payload: { taskId: taskId('task-1'), recoveryId: `recovery-${commandIdentifier}` },
  actor: { kind: 'SYSTEM', name: 'integration-test' },
  issuedAt: now,
  availableAt: new Date('2000-01-01T00:00:00.000Z'),
  correlationId: correlationId('correlation-1'),
  causationId: eventId('event-1'),
  ...overrides
});

describe('PostgreSQL persistence exports', () => {
  it('exports the durable store and repository adapters', () => {
    expect(moduleExports.PostgresStore).toBeDefined();
    expect(moduleExports.PostgresTaskRepository).toBeDefined();
    expect(moduleExports.PostgresOutbox).toBeDefined();
  });
});

integration('PostgreSQL persistence', () => {
  let pool: Pool;
  let store: PostgresStoreContract;
  let tasks: TaskRepository;
  let outbox: PostgresOutboxContract;
  let container: { stop(): Promise<unknown> } | undefined;

  beforeAll(async () => {
    let connectionString = process.env.DATABASE_URL;
    if (connectionString === undefined) {
      const { GenericContainer, Wait } = await import('testcontainers');
      const started = await new GenericContainer('postgres:16-alpine')
        .withEnvironment({
          POSTGRES_DB: 'aicompany',
          POSTGRES_USER: 'aicompany',
          POSTGRES_PASSWORD: 'aicompany_local_only'
        })
        .withExposedPorts(5432)
        .withWaitStrategy(
          Wait.forAll([
            Wait.forListeningPorts(),
            Wait.forLogMessage(/database system is ready to accept connections/i)
          ])
        )
        .start();
      container = started;
      connectionString = `postgresql://aicompany:aicompany_local_only@${started.getHost()}:${started.getMappedPort(5432)}/aicompany`;
    }

    pool = new Pool({ connectionString });
    const migrationPath = fileURLToPath(new URL('../migrations/001_orchestration.sql', import.meta.url));
    await pool.query(await readFile(migrationPath, 'utf8'));
    store = new moduleExports.PostgresStore(pool);
    tasks = new moduleExports.PostgresTaskRepository(pool);
    outbox = new moduleExports.PostgresOutbox(pool, { leaseDurationMs: 60_000 });
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE approvals, agent_sessions, domain_events, outbox_commands, tasks, workflows RESTART IDENTITY CASCADE'
    );
  });

  it('stores ordered events and retries an identical append idempotently', async () => {
    const events = [makeEvent(1), makeEvent(2)];

    await store.append(events, 0);
    await store.append(events, 0);

    expect((await store.readStream('task-1')).map((event) => event.aggregateVersion)).toEqual([1, 2]);
    expect(await store.hasEvent(eventId('event-1'))).toBe(true);
    await expect(
      store.append([{ ...events[0], payload: { taskId: taskId('task-2') } }], 0)
    ).rejects.toThrow(/duplicate|different/i);
  });

  it('round-trips date-valued canonical event payloads', async () => {
    const event: DomainEvent = {
      ...makeEvent(1),
      eventType: 'APPROVAL_APPROVED',
      payload: { approvalId: approvalId('approval-1'), decidedAt: now }
    };

    await store.append([event], 0);

    await expect(store.readStream('task-1')).resolves.toEqual([event]);
    await expect(store.append([event], 0)).resolves.toBeUndefined();
  });

  it('rolls back task, event and outbox writes on a version conflict', async () => {
    await expect(
      store.saveTaskAndAppend({
        task: makeTask({ id: taskId('task-mismatch') }),
        expectedVersion: 0,
        events: [makeEvent(1, 'event-mismatch')],
        commands: []
      })
    ).rejects.toThrow(/aggregate|task/i);
    await expect(
      store.saveTaskAndAppend({
        task: makeTask(),
        expectedVersion: 0,
        events: [makeEvent(2, 'event-version-mismatch')],
        commands: []
      })
    ).rejects.toThrow(/version/i);

    await store.append([makeEvent(1)], 0);
    const original = makeTask();
    await tasks.save(original, 0);

    const updated = makeTask({ state: 'READY', version: 1 });
    await expect(
      store.saveTaskAndAppend({
        task: updated,
        expectedVersion: 0,
        events: [makeEvent(2, 'event-rollback')],
        commands: [makeCommand('command-rollback')]
      })
    ).rejects.toThrow(/version|concurrency/i);

    expect(await tasks.get(taskId('task-1'))).toEqual(original);
    expect((await store.readStream('task-1')).map((event) => event.eventId)).toEqual([
      eventId('event-1')
    ]);
    expect(await outbox.claim(1, 'rollback-check')).toEqual([]);
  });

  it('allows only one concurrent task version update to commit its event and command', async () => {
    await tasks.save(makeTask(), 0);
    const attempts = [
      store.saveTaskAndAppend({
        task: makeTask({ state: 'READY', version: 1 }),
        expectedVersion: 0,
        events: [makeEvent(1, 'event-concurrent-a')],
        commands: [makeCommand('command-concurrent-a')]
      }),
      store.saveTaskAndAppend({
        task: makeTask({ state: 'BLOCKED', version: 1 }),
        expectedVersion: 0,
        events: [makeEvent(1, 'event-concurrent-b')],
        commands: [makeCommand('command-concurrent-b')]
      })
    ];

    const results = await Promise.allSettled(attempts);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await store.readStream('task-1'))).toHaveLength(1);
    expect((await outbox.claim(2, 'concurrency-check'))).toHaveLength(1);
    expect((await tasks.get(taskId('task-1')))?.version).toBe(1);
  });

  it('does not deliver an uncompleted command to two workers and reclaims a stale lease', async () => {
    const concurrent = makeCommand('command-concurrent-enqueue');
    await expect(
      Promise.all([outbox.enqueue(concurrent), outbox.enqueue(structuredClone(concurrent))])
    ).resolves.toEqual([undefined, undefined]);
    expect((await outbox.claim(2, 'enqueue-check')).map((command) => command.commandId)).toEqual([
      'command-concurrent-enqueue'
    ]);

    await outbox.enqueue(makeCommand('command-exclusive'));
    const [workerA, workerB] = await Promise.all([
      outbox.claim(1, 'worker-a'),
      outbox.claim(1, 'worker-b')
    ]);
    expect(workerA.length + workerB.length).toBe(1);
    const claimed = workerA[0] ?? workerB[0];
    expect(claimed).toBeDefined();
    const claimedState = await pool.query(
      `SELECT claimed_by, claimed_at, completed_at
       FROM outbox_commands
       WHERE command_id = $1`,
      ['command-exclusive']
    );
    await expect(outbox.enqueue(makeCommand('command-exclusive'))).resolves.toBeUndefined();
    expect(await outbox.claim(1, 'worker-c')).toEqual([]);
    await expect(
      pool.query(
        `SELECT claimed_by, claimed_at, completed_at
         FROM outbox_commands
         WHERE command_id = $1`,
        ['command-exclusive']
      )
    ).resolves.toEqual(claimedState);
    await outbox.markCompleted('command-exclusive');
    const completedState = await pool.query(
      `SELECT claimed_by, claimed_at, completed_at
       FROM outbox_commands
       WHERE command_id = $1`,
      ['command-exclusive']
    );
    expect(await outbox.claim(1, 'worker-c')).toEqual([]);
    await expect(outbox.enqueue(makeCommand('command-exclusive'))).resolves.toBeUndefined();
    expect(await outbox.claim(1, 'worker-c')).toEqual([]);
    await expect(
      pool.query(
        `SELECT claimed_by, claimed_at, completed_at
         FROM outbox_commands
         WHERE command_id = $1`,
        ['command-exclusive']
      )
    ).resolves.toEqual(completedState);

    await expect(
      outbox.enqueue(
        makeCommand('command-exclusive', {
          payload: { taskId: taskId('task-1'), recoveryId: 'different-recovery' }
        })
      )
    ).rejects.toThrow(/duplicate|different/i);

    await expect(
      outbox.enqueue(makeCommand('command-partial', { claimedBy: 'worker-only' }))
    ).rejects.toThrow();
    await expect(
      outbox.enqueue(makeCommand('command-partial-at', { claimedAt: now }))
    ).rejects.toThrow();
    const sqlPartial = makeCommand('command-sql-partial', { claimedBy: 'worker-only' });
    await expect(
      pool.query(
        `INSERT INTO outbox_commands (
           command_id, command_type, payload, available_at, claimed_by, claimed_at,
           completed_at, actor, issued_at, correlation_id, causation_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          sqlPartial.commandId,
          sqlPartial.type,
          JSON.stringify(sqlPartial.payload),
          sqlPartial.availableAt,
          sqlPartial.claimedBy,
          null,
          null,
          JSON.stringify(sqlPartial.actor),
          sqlPartial.issuedAt,
          sqlPartial.correlationId,
          sqlPartial.causationId
        ]
      )
    ).rejects.toThrow();

    await outbox.enqueue(
      makeCommand('command-stale', {
        claimedBy: 'old-worker',
        claimedAt: new Date(Date.now() - 60 * 60 * 1000)
      })
    );
    expect((await outbox.claim(1, 'worker-recovery')).map((command) => command.commandId)).toEqual([
      'command-stale'
    ]);
  });
});
