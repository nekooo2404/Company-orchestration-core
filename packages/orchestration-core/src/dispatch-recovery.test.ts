import { describe, expect, it } from 'vitest';
import {
  agentDefinitionId, agentSessionId, correlationId, taskId, workflowId, type Task
} from '@aicompany/contracts';
import { TaskDispatcher, type AgentSessionLauncher, type LaunchAgentSessionInput } from './dispatch';
import { createDefaultRecoveryStrategies } from './recovery-strategies';
import { InMemoryRecoveryRecordStore, RecoveryCoordinatorService } from './recovery';
import { InMemoryDispatchClaimStore, InMemoryEventStore, InMemoryOutbox, InMemoryTaskRepository, InMemoryTransactionalPersistence } from './test-support/inmemory-store';
import type { AgentSession } from '@aicompany/contracts';
import type { SaveApprovalDecisionAndTaskInput, SaveTaskAndAppendInput, TransactionalPersistence } from './ports';

const now = new Date('2026-11-08T00:00:00.000Z');

const makeTask = (): Task => ({
  id: taskId('dispatch-recovery'), workflowId: workflowId('workflow-1'), state: 'READY',
  dependencyIds: [], requiredCapabilities: ['repo.read'], outputContract: 'validated output',
  budget: { maxTokens: 1000, maxCostUsd: 1 }, recoveryCycles: 0, projectId: 'project-1',
  parentTaskId: null, ownerAgentDefinitionId: null, deadline: null,
  traceId: correlationId('trace-dispatch-recovery'), version: 0, createdAt: now, updatedAt: now
});

class FailingLauncher implements AgentSessionLauncher {
  public async launch(input: LaunchAgentSessionInput): Promise<AgentSession> {
    void input;
    throw new Error('provider rejected launch');
  }

  public async stop(): Promise<void> {}
}

class AtomicMemoryPersistence implements TransactionalPersistence {
  public readonly calls: SaveTaskAndAppendInput[] = [];

  public constructor(
    private readonly tasks: InMemoryTaskRepository,
    private readonly events: InMemoryEventStore,
    private readonly outbox: InMemoryOutbox
  ) {}

  public async saveTaskAndAppend(input: SaveTaskAndAppendInput): Promise<void> {
    this.calls.push(input);
    await this.tasks.save(input.task, input.expectedVersion);
    await this.events.append(input.events, input.expectedVersion);
    for (const command of input.commands) await this.outbox.enqueue(command);
  }

  public async saveApprovalDecisionAndTask(input: SaveApprovalDecisionAndTaskInput): Promise<void> {
    void input;
    throw new Error('atomic approval persistence is not used by dispatcher recovery');
  }

  public async claimDispatch() { return null; }
  public async releaseDispatch(): Promise<boolean> { return false; }
}

describe('dispatcher recovery wiring', () => {
  it('moves a launcher failure from READY to FAILED to RECOVERING with one recovery record and command', async () => {
    const task = makeTask();
    const tasks = new InMemoryTaskRepository();
    const events = new InMemoryEventStore();
    const outbox = new InMemoryOutbox({ now: () => now });
    const persistence = new AtomicMemoryPersistence(tasks, events, outbox);
    const records = new InMemoryRecoveryRecordStore();
    const transactional = new InMemoryTransactionalPersistence(
      persistence,
      new InMemoryDispatchClaimStore(tasks)
    );
    const coordinator = new RecoveryCoordinatorService({
      taskRepository: tasks,
      transactionalPersistence: transactional,
      records,
      strategies: createDefaultRecoveryStrategies(),
      now: () => now,
      newRecoveryId: (cycle) => `recovery:${cycle}`
    });
    await tasks.save(task, 0);

    const result = await new TaskDispatcher({
      transactionalPersistence: transactional,
      launcher: new FailingLauncher(),
      clock: { now: () => now },
      recoveryCoordinator: coordinator
    }).dispatch({
      task,
      agentDefinitionId: agentDefinitionId('agent-default'),
      lease: { taskId: task.id, leaseId: 'lease-1', expiresAt: new Date(now.getTime() + 1000) },
      sessionId: agentSessionId('session-1')
    });

    expect(result).toEqual({ decision: null, releaseClaim: true });
    expect((await tasks.get(task.id))?.state).toBe('RECOVERING');
    expect((await tasks.get(task.id))?.recoveryCycles).toBe(1);
    expect((await records.list(task.id))).toHaveLength(1);
    const commands = await outbox.claim(10, 'recovery-consumer');
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe('START_RECOVERY');
    expect(persistence.calls[0].commands).toHaveLength(0);
    expect(persistence.calls[1].commands).toHaveLength(1);
    expect(persistence.calls.map(({ events: savedEvents }) => savedEvents.map(({ eventType }) => eventType)))
      .toEqual([['TASK_FAILED'], ['RECOVERY_STARTED']]);
  });
});
