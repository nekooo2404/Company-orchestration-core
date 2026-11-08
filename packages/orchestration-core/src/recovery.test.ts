import { beforeEach, describe, expect, it } from 'vitest';
import {
  agentDefinitionId, agentSessionId, correlationId, eventId, taskId, workflowId, type Task
} from '@aicompany/contracts';
import {
  InMemoryApprovalTransactionalPersistence, InMemoryDispatchClaimStore, InMemoryEventStore, InMemoryOutbox, InMemoryTaskRepository
} from './test-support/inmemory-store';
import { InMemoryApprovalStore } from './approvals';
import {
  InMemoryRecoveryRecordStore, RecoveryCoordinatorService
} from './recovery';
import { createDefaultRecoveryStrategies } from './recovery-strategies';
import { transitionTask } from './task-state-machine';

const now = new Date('2026-11-08T10:00:00.000Z');
const actor = { kind: 'SYSTEM' as const, name: 'recovery-test' };
const makeTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id: taskId(id), workflowId: workflowId('workflow-1'), state: 'FAILED', dependencyIds: [],
  requiredCapabilities: ['repo.read'], outputContract: 'verified result',
  budget: { maxTokens: 1000, maxCostUsd: 1 }, recoveryCycles: 0, projectId: 'project-1',
  parentTaskId: null, ownerAgentDefinitionId: null, deadline: null,
  traceId: correlationId('trace-1'), version: 0, createdAt: now, updatedAt: now, ...overrides
});

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
    const persistence = new InMemoryApprovalTransactionalPersistence({
      tasks, events: eventStore, outbox, approvals: new InMemoryApprovalStore(), records
    });
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

  it('consumes BLOCKED and TASK_FAILED events and replays the same event idempotently', async () => {
    const eventCoordinator = new RecoveryCoordinatorService({
      taskRepository: tasks, transactionalPersistence: new InMemoryApprovalTransactionalPersistence({
        tasks, events: eventStore, outbox, approvals: new InMemoryApprovalStore(), records
      }), records, strategies: createDefaultRecoveryStrategies(), now: () => now,
      newRecoveryId: (cycle, taskId) => `event-recovery:${taskId}:cycle:${cycle}`
    });
    const blocked = makeTask('event-blocked', { state: 'READY' });
    const blockedTransition = transitionTask(blocked, { type: 'TASK_BLOCKED', reason: 'event-blocked' }, {
      actor, now, evidenceIds: [], isDeployment: false
    });
    await tasks.save(blocked, 0);
    await eventStore.append([blockedTransition.event], 0);
    await tasks.save(blockedTransition.task, 0);
    const blockedStarted = await eventCoordinator.handleTaskEvent(blockedTransition.event);
    expect(blockedStarted?.state).toBe('STARTED');

    const failed = makeTask('event-failed', { state: 'READY' });
    const failedTransition = transitionTask(failed, { type: 'TASK_FAILED', failureFingerprint: 'event-failure' }, {
      actor, now, evidenceIds: ['failure-log'], isDeployment: false
    });
    await tasks.save(failed, 0);
    await eventStore.append([failedTransition.event], 0);
    await tasks.save(failedTransition.task, 0);
    const started = await eventCoordinator.handleTaskEvent(failedTransition.event);
    expect(started?.state).toBe('STARTED');
    await expect(eventCoordinator.handleTaskEvent(failedTransition.event)).resolves.toEqual(started);
    expect((await tasks.get(failed.id))?.state).toBe('RECOVERING');
  });

  it('rolls back recovery start with its record and replays the same fingerprint once', async () => {
    const task = makeTask('atomic-recovery');
    const localTasks = new InMemoryTaskRepository();
    const localEvents = new InMemoryEventStore();
    const localOutbox = new InMemoryOutbox({ now: () => now });
    const localRecords = new InMemoryRecoveryRecordStore();
    await localTasks.save(task, 0);
    const makeCoordinator = (failAfter?: 'after-recovery-record') => new RecoveryCoordinatorService({
      taskRepository: localTasks,
      transactionalPersistence: new InMemoryApprovalTransactionalPersistence({
        tasks: localTasks, events: localEvents, outbox: localOutbox,
        approvals: new InMemoryApprovalStore(), records: localRecords, failAfter
      }),
      records: localRecords, strategies: createDefaultRecoveryStrategies(), now: () => now
    });
    await expect(makeCoordinator('after-recovery-record').start(request('atomic-recovery', task))).rejects.toThrow(/Injected/);
    expect((await localTasks.get(task.id))?.state).toBe('FAILED');
    expect(await localRecords.list(task.id)).toEqual([]);
    expect(await localEvents.readStream(task.id)).toEqual([]);
    const coordinator = makeCoordinator();
    const started = await coordinator.start(request('atomic-recovery', task));
    expect(await coordinator.start(request('atomic-recovery', task))).toEqual(started);
    expect((await localRecords.list(task.id))).toHaveLength(1);
  });

  it('rolls back a failed completion and permits an exact retry', async () => {
    const failed = makeTask('completion-rollback');
    const localTasks = new InMemoryTaskRepository();
    const localEvents = new InMemoryEventStore();
    const localOutbox = new InMemoryOutbox({ now: () => now });
    const localRecords = new InMemoryRecoveryRecordStore();
    await localTasks.save(failed, 0);
    const makeCoordinator = (failAfter?: 'after-recovery-record') => new RecoveryCoordinatorService({
      taskRepository: localTasks,
      transactionalPersistence: new InMemoryApprovalTransactionalPersistence({ tasks: localTasks,
        events: localEvents, outbox: localOutbox, approvals: new InMemoryApprovalStore(),
        records: localRecords, failAfter }),
      records: localRecords, strategies: createDefaultRecoveryStrategies(), now: () => now
    });
    const started = await makeCoordinator().start(request('completion-rollback', failed));
    const input = { recoveryId: started.recoveryId, taskId: failed.id,
      succeeded: true, evidenceIds: ['proof'] };
    await expect(makeCoordinator('after-recovery-record').complete(input)).rejects.toThrow(/Injected/);
    expect((await localTasks.get(failed.id))?.state).toBe('RECOVERING');
    expect((await localRecords.get(started.recoveryId))?.state).toBe('STARTED');
    await makeCoordinator().complete(input);
    await makeCoordinator().complete(input);
    expect((await localTasks.get(failed.id))?.state).toBe('READY');
    expect((await localEvents.readStream(failed.id)).filter(({ eventType }) => eventType === 'TASK_READY')).toHaveLength(1);
  });

  it('retires prior dispatch claim and start command when recovery returns to ready', async () => {
    const ready = makeTask('recover-with-claim', { state: 'READY' });
    const localTasks = new InMemoryTaskRepository();
    const localEvents = new InMemoryEventStore();
    const localOutbox = new InMemoryOutbox({ now: () => now });
    const localRecords = new InMemoryRecoveryRecordStore();
    const claims = new InMemoryDispatchClaimStore(localTasks);
    const persistence = new InMemoryApprovalTransactionalPersistence({ tasks: localTasks,
      events: localEvents, outbox: localOutbox, approvals: new InMemoryApprovalStore(),
      records: localRecords, claims });
    await localTasks.save(ready, 0);
    await claims.claimDispatch({ taskId: ready.id, taskVersion: 0, taskState: 'READY',
      workerId: 'old', agentDefinitionId: agentDefinitionId('agent-1'),
      sessionId: agentSessionId('session-old'), leaseId: 'lease-old',
      now, expiresAt: new Date(now.getTime() + 60_000) });
    await localOutbox.enqueue({ commandId: 'start-old', type: 'START_AGENT_SESSION',
      payload: { taskId: ready.id, workflowId: ready.workflowId,
        agentDefinitionId: agentDefinitionId('agent-1'), leaseId: 'lease-old',
        idempotencyKey: agentSessionId('session-old') }, actor,
      issuedAt: now, availableAt: now, correlationId: ready.traceId, causationId: eventId('old-start') });
    const failed = transitionTask(ready, { type: 'TASK_FAILED', failureFingerprint: 'launch-failed' },
      { actor, now, evidenceIds: [], isDeployment: false });
    await persistence.saveTaskAndAppend({ task: failed.task, expectedVersion: 0, events: [failed.event], commands: [] });
    const local = new RecoveryCoordinatorService({ taskRepository: localTasks,
      transactionalPersistence: persistence, records: localRecords,
      strategies: createDefaultRecoveryStrategies(), now: () => now });
    const started = await local.start(request('recover-with-claim', failed.task));
    await local.complete({ recoveryId: started.recoveryId, taskId: ready.id, succeeded: true, evidenceIds: ['proof'] });
    expect(await claims.getDispatchClaim(ready.id)).toBeNull();
    expect((await localOutbox.claim(10, 'audit')).some(({ commandId }) => commandId === 'start-old')).toBe(false);
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
    await coordinator.complete({ recoveryId: fifth.recoveryId, taskId: failed.id, succeeded: false, evidenceIds: ['repair-proof-5'] });

    expect((await tasks.get(failed.id))?.state).toBe('ESCALATED_TO_CEO');
    expect((await tasks.get(failed.id))?.recoveryCycles).toBe(5);
    expect((await tasks.get(independent.id))?.state).toBe('READY');
    expect((await tasks.get(dependent.id))?.state).toBe('PENDING');
    expect((await records.get(fifth.recoveryId))?.state).toBe('ESCALATED');
    expect((await eventStore.readStream(failed.id)).filter(({ eventType }) => eventType === 'TASK_ESCALATED')).toHaveLength(1);
    expect((await outbox.claim(10, 'approval-worker')).some(({ type, payload }) =>
      type === 'REQUEST_APPROVAL' && payload.subjectType === 'RECOVERY_ESCALATION'
    )).toBe(true);
  });
});
