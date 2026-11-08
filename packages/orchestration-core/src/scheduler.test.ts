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
  LeaseManager,
  TaskScheduler,
  findReadyTasks,
  type AgentSessionLauncher,
  type Clock,
  type LaunchAgentSessionInput,
  type RecoveryRequest,
  type SaveTaskAndAppendInput,
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

const makeSession = (input: LaunchAgentSessionInput): AgentSession => ({
  sessionId: agentSessionId(`session-${input.taskId}`),
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

  public async launch(input: LaunchAgentSessionInput): Promise<AgentSession> {
    this.calls.push(input);
    if (this.failures.has(input.taskId)) {
      throw new Error(`provider rejected ${input.taskId}`);
    }
    return makeSession(input);
  }

  public async stop(): Promise<void> {}
}

class TestTransactionalPersistence implements TransactionalPersistence {
  public readonly calls: SaveTaskAndAppendInput[] = [];

  public constructor(
    private readonly repository: InMemoryTaskRepository,
    private readonly outbox: InMemoryOutbox
  ) {}

  public async saveTaskAndAppend(input: SaveTaskAndAppendInput): Promise<void> {
    this.calls.push(input);
    await this.repository.save(input.task, input.expectedVersion);
    for (const command of input.commands) {
      await this.outbox.enqueue(command);
    }
  }
}

class TestRecoveryCoordinator {
  public readonly requests: RecoveryRequest[] = [];

  public async request(input: RecoveryRequest): Promise<void> {
    this.requests.push(input);
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
    const harness = makeScheduler({ tasks: [task] });
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
      payload: { taskId: task.id, leaseId: decision.leaseId }
    });
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
    expect(recovery.requests[0]).toMatchObject({ taskId: 'task-b', failureFingerprint: expect.any(String) });
    const failureCall = harness.persistence.calls.find(({ task: savedTask, commands }) =>
      savedTask.id === 'task-b' && commands.some(({ type }) => type === 'START_RECOVERY')
    );
    expect(failureCall?.events.map(({ eventType, aggregateVersion }) => [eventType, aggregateVersion]))
      .toEqual([['TASK_FAILED', 2]]);
    expect(failureCall?.commands).toHaveLength(1);
    expect(failureCall?.commands[0].type).toBe('START_RECOVERY');
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
