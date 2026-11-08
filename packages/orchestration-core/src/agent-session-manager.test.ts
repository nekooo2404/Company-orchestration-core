import { describe, expect, it } from 'vitest';
import {
  agentDefinitionId,
  agentSessionId,
  correlationId,
  eventId,
  taskId,
  workflowId,
  type Task
} from '@aicompany/contracts';
import { AgentSessionManagerService } from './agent-session-manager';
import { InMemoryCheckpointStore } from './checkpoints';
import { InMemoryAgentSessionRepository } from './session-commands';
import { InMemoryTaskRepository } from './test-support/inmemory-store';

const now = new Date('2026-11-08T00:00:00.000Z');
const task: Task = {
  id: taskId('task-1'), workflowId: workflowId('workflow-1'), state: 'READY', dependencyIds: [],
  requiredCapabilities: [], outputContract: 'result', budget: { maxTokens: 100, maxCostUsd: 1 },
  recoveryCycles: 0, projectId: 'project-1', parentTaskId: null, ownerAgentDefinitionId: null,
  deadline: null, traceId: correlationId('trace-1'), version: 0, createdAt: now, updatedAt: now
};

const setup = (dependentCleanupPending: () => boolean = () => false) => {
  const tasks = new InMemoryTaskRepository();
  const sessions = new InMemoryAgentSessionRepository();
  const checkpoints = new InMemoryCheckpointStore();
  const commands: unknown[] = [];
  const persist = async (taskUpdate: Task | null, expectedTaskVersion: number, session: import('@aicompany/contracts').AgentSession, expectedSessionVersion: number) => {
    if (taskUpdate) await tasks.save(taskUpdate, expectedTaskVersion);
    await sessions.save(session, expectedSessionVersion);
  };
  const manager = new AgentSessionManagerService({
    taskRepository: tasks, sessionRepository: sessions, checkpointStore: checkpoints,
    lifecyclePersistence: {
      start: ({ task: updatedTask, expectedTaskVersion, session }) => persist(updatedTask, expectedTaskVersion, session, 0),
      cancel: ({ task: updatedTask, expectedTaskVersion, session, expectedSessionVersion }) => persist(updatedTask, expectedTaskVersion, session, expectedSessionVersion),
      transition: ({ session, expectedSessionVersion }) => persist(null, 0, session, expectedSessionVersion)
    },
    commandSink: { async emit(command) { commands.push(command); } },
    clock: { now: () => new Date(now) },
    idFactory: (attempt) => agentSessionId(`session-${attempt}`),
    hasPendingCleanup: dependentCleanupPending
  });
  return { tasks, sessions, checkpoints, commands, manager };
};

describe('agent session lifecycle', () => {
  it('starts a leased task and creates a durable session', async () => {
    const h = setup();
    await h.tasks.save(task, 0);
    const started = await h.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId });
    expect(started.state).toBe('RUNNING');
    expect(started.sessionId).toBe('session-1');
    expect((await h.tasks.get(task.id))?.state).toBe('RUNNING');
    expect(h.commands).toHaveLength(1);
  });

  it('checkpoints after an event and resumes with the same identity and completed operation keys', async () => {
    const h = setup();
    await h.tasks.save(task, 0);
    const started = await h.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId });
    const checkpoint = await h.manager.checkpoint({ sessionId: started.sessionId, expectedSequence: 0, state: 'WAITING_FOR_TOOL', contextReference: 'ctx:1', lastEventId: eventId('event-1'), completedOperationKeys: ['tool:charge:1'] });
    expect(checkpoint.sequence).toBe(1);
    const resumed = await h.manager.resume(started.sessionId);
    expect(resumed.sessionId).toBe(started.sessionId);
    expect(resumed.attempt).toBe(2);
    expect((h.commands[1] as { payload: { completedOperationKeys: string[] } }).payload.completedOperationKeys).toContain('tool:charge:1');
  });

  it('pauses without changing task state and makes duplicate pause idempotent', async () => {
    const h = setup(); await h.tasks.save(task, 0);
    const session = await h.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId });
    await h.manager.pause(session.sessionId, 'operator request');
    await h.manager.pause(session.sessionId, 'operator request');
    expect((await h.sessions.get(session.sessionId))?.state).toBe('PAUSED');
    expect((await h.tasks.get(task.id))?.state).toBe('RUNNING');
  });

  it('blocks cancellation while dependent cleanup is pending and cancels atomically otherwise', async () => {
    const blocked = setup(() => true); await blocked.tasks.save(task, 0);
    const first = await blocked.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId });
    await expect(blocked.manager.cancel(first.sessionId, 'stop')).rejects.toThrow(/cleanup/i);
    expect((await blocked.tasks.get(task.id))?.state).toBe('RUNNING');

    const h = setup(); await h.tasks.save(task, 0);
    const second = await h.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId });
    await h.manager.cancel(second.sessionId, 'stop');
    await h.manager.cancel(second.sessionId, 'stop');
    expect((await h.sessions.get(second.sessionId))?.state).toBe('CANCELLED');
    expect((await h.tasks.get(task.id))?.state).toBe('CANCELLED');
  });

  it('does not resume a cancelled session', async () => {
    const h = setup(); await h.tasks.save(task, 0);
    const session = await h.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId });
    await h.manager.cancel(session.sessionId, 'stop');
    await expect(h.manager.resume(session.sessionId)).rejects.toThrow(/cancelled/i);
  });
});

