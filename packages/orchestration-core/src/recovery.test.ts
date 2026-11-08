import { beforeEach, describe, expect, it } from 'vitest';
import {
  correlationId, taskId, workflowId, type Task
} from '@aicompany/contracts';
import {
  InMemoryEventStore, InMemoryOutbox, InMemoryTaskRepository
} from './test-support/inmemory-store';
import {
  InMemoryRecoveryRecordStore, RecoveryCoordinatorService
} from './recovery';
import type { SaveTaskAndAppendInput, TransactionalPersistence } from './ports';
import { createDefaultRecoveryStrategies } from './recovery-strategies';

const now = new Date('2026-11-08T10:00:00.000Z');
const actor = { kind: 'SYSTEM' as const, name: 'recovery-test' };
const makeTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id: taskId(id), workflowId: workflowId('workflow-1'), state: 'FAILED', dependencyIds: [],
  requiredCapabilities: ['repo.read'], outputContract: 'verified result',
  budget: { maxTokens: 1000, maxCostUsd: 1 }, recoveryCycles: 0, projectId: 'project-1',
  parentTaskId: null, ownerAgentDefinitionId: null, deadline: null,
  traceId: correlationId('trace-1'), version: 0, createdAt: now, updatedAt: now, ...overrides
});

class RecoveryTestPersistence implements TransactionalPersistence {
  public constructor(
    private readonly tasks: InMemoryTaskRepository,
    private readonly events: InMemoryEventStore,
    private readonly outbox: InMemoryOutbox
  ) {}

  public async saveTaskAndAppend(input: SaveTaskAndAppendInput): Promise<void> {
    await this.tasks.save(input.task, input.expectedVersion);
    await this.events.append(input.events, input.expectedVersion);
    for (const command of input.commands) await this.outbox.enqueue(command);
  }

  public async claimDispatch(): Promise<null> { return null; }
  public async releaseDispatch(): Promise<boolean> { return false; }
}

describe('recovery coordinator', () => {
  let tasks: InMemoryTaskRepository;
  let eventStore: InMemoryEventStore;
  let outbox: InMemoryOutbox;
  let records: InMemoryRecoveryRecordStore;
  let coordinator: RecoveryCoordinatorService;

  beforeEach(() => {
    tasks = new InMemoryTaskRepository();
    eventStore = new InMemoryEventStore();
    outbox = new InMemoryOutbox({ now: () => now });
    records = new InMemoryRecoveryRecordStore();
    const persistence = new RecoveryTestPersistence(tasks, eventStore, outbox);
    coordinator = new RecoveryCoordinatorService({
      taskRepository: tasks, transactionalPersistence: persistence, records,
      strategies: createDefaultRecoveryStrategies(), now: () => now,
      newRecoveryId: (cycle) => `recovery:${cycle}`,
      newApprovalId: (cycle) => `approval:${cycle}`
    });
  });

  const seed = async (...items: Task[]) => {
    for (const task of items) await tasks.save(task, 0);
  };
  const request = (id: string, task: Task, message = 'module not found') => ({
    taskId: task.id,
    failure: {
      taskId: task.id, attemptId: `attempt-${id}`, errorClass: 'BuildError',
      commandName: 'build', exitCode: 1, message, evidenceIds: [`log-${id}`]
    },
    actor, correlationId: task.traceId
  });

  it('starts recovery transactionally from BLOCKED and FAILED and records its bounded cycle', async () => {
    const blocked = makeTask('blocked-1', { state: 'BLOCKED' });
    await seed(blocked);

    const record = await coordinator.start(request('blocked-1', blocked));

    expect(record.cycle).toBe(1);
    expect(record.state).toBe('STARTED');
    expect((await tasks.get(blocked.id))?.state).toBe('RECOVERING');
    expect((await eventStore.readStream(blocked.id)).at(-1)?.eventType).toBe('RECOVERY_STARTED');
    expect((await outbox.claim(10, 'test-worker')).map(({ type }) => type)).toEqual(['START_RECOVERY']);
  });

  it('rejects a repeated fingerprint unless the recovery strategy changes', async () => {
    const task = makeTask('repeat-1');
    await seed(task);
    const first = await coordinator.start(request('repeat-1', task));
    await coordinator.complete({ recoveryId: first.recoveryId, taskId: task.id, succeeded: false, evidenceIds: ['repair-failed'] });
    const failed = (await tasks.get(task.id))!;
    const second = await coordinator.start(request('repeat-1-next', failed));

    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.plan.strategyName).not.toBe(first.plan.strategyName);
    expect(second.plan.changedAssumption).toBeTruthy();
  });

  it('returns a successfully repaired task to READY and retains completion evidence', async () => {
    const task = makeTask('success-1');
    await seed(task);
    const record = await coordinator.start(request('success-1', task));

    await coordinator.complete({ recoveryId: record.recoveryId, taskId: task.id, succeeded: true, evidenceIds: ['repair-proof'] });

    expect((await tasks.get(task.id))?.state).toBe('READY');
    expect((await records.get(record.recoveryId))?.state).toBe('SUCCEEDED');
    expect((await records.get(record.recoveryId))?.evidenceIds).toContain('repair-proof');
  });

  it('escalates the fifth failed cycle with accumulated evidence and leaves independent branches untouched', async () => {
    const failed = makeTask('branch-failed', { recoveryCycles: 4 });
    const independent = makeTask('branch-independent', { state: 'READY', recoveryCycles: 0 });
    const dependent = makeTask('branch-dependent', { state: 'PENDING', dependencyIds: [failed.id], version: 0 });
    await seed(failed, independent, dependent);
    const fifth = await coordinator.start(request('branch-failed', failed));

    await coordinator.complete({ recoveryId: fifth.recoveryId, taskId: failed.id, succeeded: false, evidenceIds: ['repair-proof-5'] });

    expect((await tasks.get(failed.id))?.state).toBe('ESCALATED_TO_CEO');
    expect((await tasks.get(failed.id))?.recoveryCycles).toBe(5);
    expect((await tasks.get(independent.id))?.state).toBe('READY');
    expect((await tasks.get(dependent.id))?.state).toBe('PENDING');
    expect((await records.get(fifth.recoveryId))?.state).toBe('ESCALATED');
    expect((await outbox.claim(10, 'approval-worker')).some(({ type, payload }) =>
      type === 'REQUEST_APPROVAL' && payload.subjectType === 'RECOVERY_ESCALATION'
    )).toBe(true);
  });
});
