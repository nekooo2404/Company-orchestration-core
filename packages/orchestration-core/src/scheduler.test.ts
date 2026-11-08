import { describe, expect, it } from 'vitest';
import {
  type AgentDefinition,
  type AgentSession,
  type Task,
  agentDefinitionId,
  agentSessionId,
  correlationId,
  taskId,
  workflowId
} from '@aicompany/contracts';
import {
  FairQueue,
  InMemoryOutbox,
  InMemoryTaskRepository,
  InMemoryDispatchClaimStore,
  LeaseManager,
  TaskScheduler,
  findReadyTasks,
  type AgentSessionLauncher,
  type Clock,
  type LaunchAgentSessionInput,
  type RecoveryRecord,
  type RecoveryRequest,
  type SaveTaskAndAppendInput,
  type SaveApprovalDecisionAndTaskInput,
  type DispatchClaimRequest,
  type TransactionalPersistence
} from './index';

const now = new Date('2026-11-08T00:00:00.000Z');

const makeTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id: taskId(id),
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
  traceId: correlationId(`trace-${id}`),
  version: 0,
  createdAt: now,
  updatedAt: now,
  ...overrides
});

const makeAgent = (
  id: string,
  department: string,
  overrides: Partial<AgentDefinition> = {}
): AgentDefinition => ({
  id: agentDefinitionId(id),
  role: 'worker',
  department,
  supervisorId: null,
  mission: 'complete assigned tasks',
  persona: 'precise',
  systemPolicy: 'follow policy',
  preferredModel: 'test-model',
  allowedCapabilities: ['repo.read', 'repo.write'],
  readableMemoryScopes: ['project'],
  writableMemoryScopes: ['project'],
  budget: { maxTokens: 10_000, maxCostUsd: 10 },
  timeoutSeconds: 60,
  maxConcurrency: 100,
  recoveryPolicy: { maxCycles: 5, allowedStrategies: ['retry'] },
  outputContract: 'validated output',
  version: 0,
  createdAt: now,
  updatedAt: now,
  ...overrides
});

const makeSession = (input: LaunchAgentSessionInput, sessionIdentifier = input.sessionId): AgentSession => ({
  sessionId: sessionIdentifier,
  taskId: input.taskId,
  workflowId: input.workflowId,
  agentDefinitionId: input.agentDefinitionId,
  state: 'RUNNING',
  contextReference: `context-${input.taskId}`,
  checkpointReference: null,
  traceId: input.correlationId,
  usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  toolCallHistory: [],
  attempt: 1,
  version: 0,
  createdAt: now,
  updatedAt: now
});

class TestClock implements Clock {
  public current = now;

  public now(): Date {
    return new Date(this.current);
  }
}

class TestLauncher implements AgentSessionLauncher {
  public readonly calls: LaunchAgentSessionInput[] = [];
  public readonly failures = new Set<string>();
  public stopFailure = false;
  public readonly stops: string[] = [];
  public returnedSessionId: AgentSession['sessionId'] | null = null;

  public async launch(input: LaunchAgentSessionInput): Promise<AgentSession> {
    this.calls.push(input);
    if (this.failures.has(input.taskId)) {
      throw new Error(`provider rejected ${input.taskId}`);
    }
    return makeSession(input, this.returnedSessionId ?? input.sessionId);
  }

  public async stop(sessionId: string): Promise<void> {
    this.stops.push(sessionId);
    if (this.stopFailure) throw new Error('provider stop failed');
  }
}

class TestTransactionalPersistence implements TransactionalPersistence {
  public readonly calls: SaveTaskAndAppendInput[] = [];
  public constructor(
    private readonly repository: InMemoryTaskRepository,
    private readonly outbox: InMemoryOutbox,
    private readonly claims = new InMemoryDispatchClaimStore(repository)
  ) {}

  public async saveTaskAndAppend(input: SaveTaskAndAppendInput): Promise<void> {
    this.calls.push(input);
    await this.repository.save(input.task, input.expectedVersion);
    for (const command of input.commands) {
      await this.outbox.enqueue(command);
    }
  }

  public async saveApprovalDecisionAndTask(input: SaveApprovalDecisionAndTaskInput): Promise<void> {
    void input;
    throw new Error('atomic approval persistence is not used by scheduler');
  }

  public claimDispatch(input: DispatchClaimRequest) { return this.claims.claimDispatch(input); }
  public releaseDispatch(taskId: Task['id'], workerId: string, leaseId: string) {
    return this.claims.releaseDispatch(taskId, workerId, leaseId);
  }
}

class TestRecoveryCoordinator {
  public readonly requests: RecoveryRequest[] = [];
  public startFailure: Error | null = null;

  public async start(input: RecoveryRequest): Promise<RecoveryRecord> {
    this.requests.push(input);
    if (this.startFailure !== null) throw this.startFailure;
    return {
      recoveryId: `test-recovery:${input.taskId}`,
      taskId: input.taskId,
      cycle: 1,
      fingerprint: 'test-fingerprint',
      plan: {
        strategyName: 'test-recovery',
        changedAssumption: 'test assumption',
        action: 'RETRY'
      },
      state: 'STARTED',
      createdAt: now,
      evidenceIds: []
    };
  }
}

const makeScheduler = (options: {
  tasks: Task[];
  agents?: readonly AgentDefinition[];
  launcher?: TestLauncher;
  clock?: TestClock;
  healthy?: boolean;
  recovery?: TestRecoveryCoordinator;
}) => {
  const repository = new InMemoryTaskRepository();
  const outbox = new InMemoryOutbox({ now: () => options.clock?.current ?? now });
  const persistence = new TestTransactionalPersistence(repository, outbox);
  return {
    repository,
    outbox,
    persistence,
    launcher: options.launcher ?? new TestLauncher(),
    recovery: options.recovery ?? new TestRecoveryCoordinator(),
    scheduler: new TaskScheduler({
      taskRepository: repository,
      transactionalPersistence: persistence,
      outbox,
      launcher: options.launcher ?? new TestLauncher(),
      clock: options.clock ?? new TestClock(),
      agentDefinitions: options.agents ?? [makeAgent('agent-default', 'engineering')],
      providerHealth: { isHealthy: () => options.healthy ?? true },
      recoveryCoordinator: options.recovery ?? new TestRecoveryCoordinator()
    })
  };
};

const seed = async (repository: InMemoryTaskRepository, tasks: readonly Task[]): Promise<void> => {
  for (const task of tasks) {
    await repository.save(task, 0);
  }
};

const seedReady = async (repository: InMemoryTaskRepository, task: Task): Promise<Task> => {
  const pending = { ...task, state: 'PENDING' as const, version: 0 };
  await repository.save(pending, 0);
  const ready = { ...pending, state: 'READY' as const, version: 1 };
  await repository.save(ready, 0);
  return ready;
};

describe('scheduler dispatch', () => {
  it('dispatches exactly 50 of 60 ready tasks and later dispatches the ten remaining tasks', async () => {
    const tasks = Array.from({ length: 60 }, (_, index) => makeTask(`task-${index.toString().padStart(2, '0')}`));
    const launcher = new TestLauncher();
    const harness = makeScheduler({ tasks, launcher });
    await seed(harness.repository, tasks);

    const first = await harness.scheduler.tick({ workflowId: workflowId('workflow-1'), capacity: 50, workerId: 'worker-a' });
    expect(first).toHaveLength(50);
    expect(new Set(first.map((decision) => decision.taskId)).size).toBe(50);
    expect(launcher.calls).toHaveLength(50);
    expect(findReadyTasks(await harness.repository.listByWorkflow(workflowId('workflow-1')), new Set()))
      .toHaveLength(10);

    const firstBatch = await harness.repository.listByWorkflow(workflowId('workflow-1'));
    for (const task of firstBatch.filter(({ state }) => state === 'RUNNING').slice(0, 10)) {
      await harness.repository.save({ ...task, state: 'COMPLETED', version: task.version + 1, updatedAt: now }, task.version);
    }

    const second = await harness.scheduler.tick({ workflowId: workflowId('workflow-1'), capacity: 10, workerId: 'worker-a' });
    expect(second).toHaveLength(10);
    expect(new Set(second.map((decision) => decision.taskId)).size).toBe(10);
    expect(launcher.calls).toHaveLength(60);
  });

  it('filters unmet dependencies, unsupported capabilities and over-budget tasks', async () => {
    const dependency = makeTask('dependency', { state: 'RUNNING' });
    const tasks = [
      dependency,
      makeTask('dependent', { dependencyIds: [dependency.id] }),
      makeTask('unsupported', { requiredCapabilities: ['repo.admin'] }),
      makeTask('over-budget', { budget: { maxTokens: 20_000, maxCostUsd: 1 } }),
      makeTask('eligible')
    ];
    const launcher = new TestLauncher();
    const harness = makeScheduler({
      tasks,
      launcher,
      agents: [makeAgent('agent-default', 'engineering')]
    });
    await seed(harness.repository, tasks);

    const decisions = await harness.scheduler.tick({ workflowId: workflowId('workflow-1'), capacity: 10, workerId: 'worker-a' });

    expect(decisions.map(({ taskId: dispatchedTaskId }) => dispatchedTaskId)).toEqual(['eligible']);
  });

  it('keeps task state and the start command in one transactional persistence call', async () => {
    const task = makeTask('task-1');
    const launcher = new TestLauncher();
    const harness = makeScheduler({ tasks: [task], launcher });
    await seed(harness.repository, [task]);

    const [decision] = await harness.scheduler.tick({ workflowId: workflowId('workflow-1'), capacity: 1, workerId: 'worker-a' });
    const startCall = harness.persistence.calls.find(({ commands }) => commands.some(({ type }) => type === 'START_AGENT_SESSION'));

    expect(harness.persistence.calls).toHaveLength(2);
    expect(harness.persistence.calls[0]).toMatchObject({
      task: { state: 'READY', version: 1 },
      events: [{ eventType: 'TASK_READY', aggregateVersion: 1 }],
      commands: []
    });
    expect(decision).toMatchObject({ taskId: task.id, leaseId: expect.any(String), expiresAt: expect.any(Date) });
    expect(startCall?.task.state).toBe('RUNNING');
    expect(startCall?.events.map(({ eventType, aggregateVersion }) => [eventType, aggregateVersion]))
      .toEqual([['TASK_STARTED', 2]]);
    expect(startCall?.expectedVersion).toBe(1);
    expect(startCall?.commands).toHaveLength(1);
    expect(startCall?.commands[0]).toMatchObject({
      type: 'START_AGENT_SESSION',
      payload: {
        taskId: task.id,
        leaseId: decision.leaseId,
        idempotencyKey: launcher.calls[0].idempotencyKey
      }
    });
    expect(launcher.calls[0].sessionId).toBe(agentSessionId(`session:dispatch:${task.id}`));
    expect(launcher.calls[0].idempotencyKey).toBe(launcher.calls[0].sessionId);
  });

  it('does not launch a second session for a repeated tick after a successful dispatch', async () => {
    const task = makeTask('task-1');
    const launcher = new TestLauncher();
    const harness = makeScheduler({ tasks: [task], launcher });
    await seed(harness.repository, [task]);

    const first = await harness.scheduler.tick({ workflowId: workflowId('workflow-1'), capacity: 1, workerId: 'worker-a' });
    const second = await harness.scheduler.tick({ workflowId: workflowId('workflow-1'), capacity: 1, workerId: 'worker-a' });

    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
    expect(launcher.calls).toHaveLength(1);
  });

  it('reclaims a lease only after its expiry', () => {
    const clock = new TestClock();
    const leases = new LeaseManager({ clock, durationMs: 1_000 });
    const first = leases.acquire(taskId('task-1'));
    const beforeExpiry = leases.acquire(taskId('task-1'));
    clock.current = new Date(now.getTime() + 1_001);
    const afterExpiry = leases.acquire(taskId('task-1'));

    expect(beforeExpiry.leaseId).toBe(first.leaseId);
    expect(afterExpiry.leaseId).not.toBe(first.leaseId);
    expect(afterExpiry.expiresAt.getTime()).toBe(clock.current.getTime() + 1_000);
  });

  it('shares a durable claim across scheduler instances and reclaims it with the same lease after expiry', async () => {
    const clock = new TestClock();
    const task = makeTask('task-shared');
    const repository = new InMemoryTaskRepository();
    await seedReady(repository, task);
    const outbox = new InMemoryOutbox({ now: () => clock.current });
    const claimStore = new InMemoryDispatchClaimStore(repository);
    const persistA = new TestTransactionalPersistence(repository, outbox, claimStore);
    const persistB = new TestTransactionalPersistence(repository, outbox, claimStore);
    const launcher = new TestLauncher();
    const makeInstance = (persistence: TestTransactionalPersistence) => new TaskScheduler({
      taskRepository: repository, transactionalPersistence: persistence, outbox, launcher, clock,
      agentDefinitions: [makeAgent('agent-default', 'engineering')]
    });
    const a = makeInstance(persistA);
    const b = makeInstance(persistB);
    const [first, second] = await Promise.all([
      a.tick({ workflowId: task.workflowId, capacity: 1, workerId: 'worker-a' }),
      b.tick({ workflowId: task.workflowId, capacity: 1, workerId: 'worker-b' })
    ]);
    expect(first.length + second.length).toBe(1);
    expect(launcher.calls).toHaveLength(1);
    expect((await repository.get(task.id))?.state).toBe('RUNNING');
  });

  it('persists the planned session identity and reuses it on READY claim reclaim', async () => {
    const task = makeTask('claim-reclaim');
    const repository = new InMemoryTaskRepository();
    const readyTask = await seedReady(repository, task);
    const claims = new InMemoryDispatchClaimStore(repository);
    const sessionId = agentSessionId(`session:dispatch:${task.id}`);
    const first = await claims.claimDispatch({
      taskId: readyTask.id, taskVersion: readyTask.version, taskState: readyTask.state,
      workerId: 'worker-a', agentDefinitionId: agentDefinitionId('agent-default'), sessionId,
      leaseId: 'lease-proposed', now, expiresAt: new Date(now.getTime() + 1000)
    });
    expect(first).toMatchObject({ leaseId: 'lease-proposed', sessionId, workerId: 'worker-a' });
    expect(await claims.claimDispatch({
      taskId: readyTask.id, taskVersion: readyTask.version, taskState: readyTask.state,
      workerId: 'worker-b', agentDefinitionId: agentDefinitionId('agent-default'), sessionId,
      leaseId: 'different-lease', now, expiresAt: new Date(now.getTime() + 1000)
    })).toBeNull();
    expect(await claims.claimDispatch({
      taskId: readyTask.id, taskVersion: readyTask.version, taskState: readyTask.state,
      workerId: 'worker-b', agentDefinitionId: agentDefinitionId('agent-default'), sessionId,
      leaseId: 'different-lease', now: new Date(now.getTime() + 1001),
      expiresAt: new Date(now.getTime() + 2001)
    })).toMatchObject({ leaseId: 'lease-proposed', sessionId, workerId: 'worker-b' });
  });

  it('reuses the persisted session and idempotency key after an interrupted launch reclaim', async () => {
    const task = makeTask('idempotent-reclaim');
    const repository = new InMemoryTaskRepository();
    await seedReady(repository, task);
    const clock = new TestClock();
    const outbox = new InMemoryOutbox({ now: () => clock.current });
    const claims = new InMemoryDispatchClaimStore(repository);
    const base = new TestTransactionalPersistence(repository, outbox, claims);
    let startPersistenceFailures = 1;
    const persistence: TransactionalPersistence = {
      ...base,
      saveTaskAndAppend: async (input) => {
        if (
          startPersistenceFailures > 0 &&
          input.commands.some(({ type }) => type === 'START_AGENT_SESSION')
        ) {
          startPersistenceFailures -= 1;
          throw new Error('start persistence unavailable');
        }
        await base.saveTaskAndAppend(input);
      },
      claimDispatch: (input) => base.claimDispatch(input),
      releaseDispatch: (id, worker, lease) => base.releaseDispatch(id, worker, lease)
    };
    const launcher = new TestLauncher();
    launcher.stopFailure = true;
    const makeInstance = () => new TaskScheduler({
      taskRepository: repository, transactionalPersistence: persistence, outbox, launcher, clock,
      leaseDurationMs: 1_000, agentDefinitions: [makeAgent('agent-default', 'engineering')]
    });

    await expect(makeInstance().tick({
      workflowId: task.workflowId, capacity: 1, workerId: 'worker-a'
    })).rejects.toThrow(/cleanup/);
    launcher.stopFailure = false;
    clock.current = new Date(now.getTime() + 1_001);
    const decisions = await makeInstance().tick({
      workflowId: task.workflowId, capacity: 1, workerId: 'worker-b'
    });

    expect(decisions).toHaveLength(1);
    expect(launcher.calls).toHaveLength(2);
    expect(launcher.calls[0].idempotencyKey).toBe(launcher.calls[0].sessionId);
    expect(launcher.calls[1]).toMatchObject({
      sessionId: launcher.calls[0].sessionId,
      idempotencyKey: launcher.calls[0].idempotencyKey
    });
  });

  it('does not dispatch without configured agent definitions', async () => {
    const task = makeTask('no-agent');
    const harness = makeScheduler({ tasks: [task], agents: [] });
    await seed(harness.repository, [task]);
    expect(await harness.scheduler.tick({ workflowId: task.workflowId, capacity: 1, workerId: 'worker-a' })).toEqual([]);
    expect(harness.launcher.calls).toHaveLength(0);
  });

  it('retains an owned claim when persistence fails and provider stop fails', async () => {
    const task = makeTask('cleanup-failure');
    const repository = new InMemoryTaskRepository();
    await seed(repository, [task]);
    const outbox = new InMemoryOutbox({ now: () => now });
    const claims = new InMemoryDispatchClaimStore(repository);
    const base = new TestTransactionalPersistence(repository, outbox, claims);
    const persistence: TransactionalPersistence = {
      ...base,
      saveTaskAndAppend: async (input) => {
        if (input.commands.some(({ type }) => type === 'START_AGENT_SESSION')) throw new Error('db unavailable');
        await base.saveTaskAndAppend(input);
      },
      claimDispatch: (input) => base.claimDispatch(input),
      releaseDispatch: (id, worker, lease) => base.releaseDispatch(id, worker, lease)
    };
    const launcher = new TestLauncher();
    launcher.stopFailure = true;
    const scheduler = new TaskScheduler({
      taskRepository: repository, transactionalPersistence: persistence, outbox, launcher,
      clock: new TestClock(), agentDefinitions: [makeAgent('agent-default', 'engineering')]
    });
    await expect(scheduler.tick({ workflowId: task.workflowId, capacity: 1, workerId: 'worker-a' })).rejects.toThrow(/cleanup/);
    const claim = await claims.claimDispatch({
      taskId: task.id, taskVersion: 1, taskState: 'READY', workerId: 'worker-b',
      agentDefinitionId: agentDefinitionId('agent-default'), sessionId: agentSessionId(`session:dispatch:${task.id}`),
      leaseId: 'new-id', now: now, expiresAt: new Date(now.getTime() + 1000)
    });
    expect(claim).toBeNull();
    expect(launcher.stops).toEqual([`session:dispatch:${task.id}`]);
  });

  it('checks worker ownership when releasing a claim', async () => {
    const repository = new InMemoryTaskRepository();
    const task = makeTask('owned');
    const readyTask = await seedReady(repository, task);
    const claims = new InMemoryDispatchClaimStore(repository);
    const input: DispatchClaimRequest = {
      taskId: readyTask.id, taskVersion: readyTask.version, taskState: readyTask.state, workerId: 'worker-a',
      agentDefinitionId: agentDefinitionId('agent-default'), sessionId: agentSessionId('session-owned'),
      leaseId: 'lease-owned', now, expiresAt: new Date(now.getTime() + 1000)
    };
    expect(await claims.claimDispatch(input)).not.toBeNull();
    expect(await claims.releaseDispatch(input.taskId, 'worker-b', input.leaseId)).toBe(false);
    expect(await claims.releaseDispatch(input.taskId, input.workerId, input.leaseId)).toBe(true);
  });

  it('rejects a stale version and a RUNNING task at the shared claim boundary', async () => {
    const task = makeTask('claim-state');
    const repository = new InMemoryTaskRepository();
    const readyTask = await seedReady(repository, task);
    const claims = new InMemoryDispatchClaimStore(repository);
    const request: DispatchClaimRequest = {
      taskId: readyTask.id, taskVersion: readyTask.version, taskState: readyTask.state, workerId: 'worker-a',
      agentDefinitionId: agentDefinitionId('agent-default'), sessionId: agentSessionId('session-state'),
      leaseId: 'lease-state', now, expiresAt: new Date(now.getTime() + 1000)
    };
    expect(await claims.claimDispatch({ ...request, taskVersion: 0 })).toBeNull();
    expect(await claims.claimDispatch(request)).not.toBeNull();
    await repository.save({ ...readyTask, state: 'RUNNING', version: 2 }, readyTask.version);
    expect(await claims.claimDispatch(request)).toBeNull();
  });

  it('stops the actual provider session when launch returns a different identity', async () => {
    const task = makeTask('session-mismatch');
    const launcher = new TestLauncher();
    launcher.returnedSessionId = agentSessionId('provider-session-different');
    const recovery = new TestRecoveryCoordinator();
    const harness = makeScheduler({ tasks: [task], launcher, recovery });
    await seed(harness.repository, [task]);
    expect(await harness.scheduler.tick({ workflowId: task.workflowId, capacity: 1, workerId: 'worker-a' })).toEqual([]);
    expect(launcher.stops).toEqual(['provider-session-different']);
    expect((await harness.repository.get(task.id))?.state).toBe('FAILED');
    expect(recovery.requests).toHaveLength(1);
    expect(recovery.requests[0].failure.commandName).toBe('START_AGENT_SESSION');
  });

  it('retains the claim when recovery fails after task failure persistence', async () => {
    const task = makeTask('session-mismatch-persistence');
    const repository = new InMemoryTaskRepository();
    await seed(repository, [task]);
    const clock = new TestClock();
    const outbox = new InMemoryOutbox({ now: () => clock.current });
    const claims = new InMemoryDispatchClaimStore(repository);
    const base = new TestTransactionalPersistence(repository, outbox, claims);
    const persistence: TransactionalPersistence = base;
    const launcher = new TestLauncher();
    launcher.returnedSessionId = agentSessionId('provider-session-different');
    const recovery = new TestRecoveryCoordinator();
    recovery.startFailure = new Error('recovery persistence unavailable');
    const scheduler = new TaskScheduler({
      taskRepository: repository, transactionalPersistence: persistence, outbox, launcher, clock,
      leaseDurationMs: 1_000, agentDefinitions: [makeAgent('agent-default', 'engineering')],
      recoveryCoordinator: recovery
    });
    await expect(scheduler.tick({
      workflowId: task.workflowId, capacity: 1, workerId: 'worker-a'
    })).rejects.toThrow('recovery persistence unavailable');
    expect(launcher.stops).toEqual(['provider-session-different']);
    expect((await repository.get(task.id))?.state).toBe('FAILED');

    clock.current = new Date(now.getTime() + 1_001);
    const reclaimed = await claims.claimDispatch({
      taskId: task.id, taskVersion: 1, taskState: 'READY', workerId: 'worker-b',
      agentDefinitionId: agentDefinitionId('agent-default'),
      sessionId: agentSessionId(`session:dispatch:${task.id}`),
      leaseId: 'new-lease', now: clock.current, expiresAt: new Date(clock.current.getTime() + 1_000)
    });
    expect(reclaimed).toBeNull();
  });

  it('marks a rejected launch failed, requests one recovery and continues unrelated tasks', async () => {
    const tasks = [makeTask('task-a'), makeTask('task-b'), makeTask('task-c')];
    const launcher = new TestLauncher();
    launcher.failures.add('task-b');
    const recovery = new TestRecoveryCoordinator();
    const harness = makeScheduler({ tasks, launcher, recovery });
    await seed(harness.repository, tasks);

    const decisions = await harness.scheduler.tick({ workflowId: workflowId('workflow-1'), capacity: 3, workerId: 'worker-a' });
    const stored = await harness.repository.listByWorkflow(workflowId('workflow-1'));

    expect(decisions.map(({ taskId: dispatchedTaskId }) => dispatchedTaskId)).toEqual(['task-a', 'task-c']);
    expect(stored.find(({ id }) => id === 'task-b')?.state).toBe('FAILED');
    expect(recovery.requests).toHaveLength(1);
    expect(recovery.requests[0]).toMatchObject({ taskId: 'task-b', failure: { errorClass: 'Error' } });
    const failureCall = harness.persistence.calls.find(({ task: savedTask, events }) =>
      savedTask.id === 'task-b' && events.some(({ eventType }) => eventType === 'TASK_FAILED')
    );
    expect(failureCall?.events.map(({ eventType, aggregateVersion }) => [eventType, aggregateVersion]))
      .toEqual([['TASK_FAILED', 2]]);
    expect(failureCall?.commands).toHaveLength(0);
    expect(failureCall?.expectedVersion).toBe(1);
  });

  it('leaves ready tasks queued when capacity is zero or the provider is unhealthy', async () => {
    const tasks = [makeTask('task-1'), makeTask('task-2')];
    const launcher = new TestLauncher();
    const clock = new TestClock();
    const harness = makeScheduler({ tasks, launcher, clock, healthy: false });
    await seed(harness.repository, tasks);

    expect(await harness.scheduler.tick({ workflowId: workflowId('workflow-1'), capacity: 0, workerId: 'worker-a' })).toEqual([]);
    expect(await harness.scheduler.tick({ workflowId: workflowId('workflow-1'), capacity: 2, workerId: 'worker-a' })).toEqual([]);
    expect(launcher.calls).toHaveLength(0);
    expect(findReadyTasks(await harness.repository.listByWorkflow(workflowId('workflow-1')), new Set()))
      .toHaveLength(2);
  });

  it('uses fair queue selection without returning an unmet dependency', () => {
    const dependency = makeTask('dependency');
    const dependent = makeTask('dependent', { dependencyIds: [dependency.id] });
    const ready = findReadyTasks([dependency, dependent], new Set());
    const queue = new FairQueue();

    expect(queue.take(ready.map((task) => ({ task, department: 'engineering' })), 10))
      .toEqual([{ task: dependency, department: 'engineering' }]);
  });
});
