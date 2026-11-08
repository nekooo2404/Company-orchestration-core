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
import { InMemoryAgentSessionRepository, InMemorySessionLifecyclePersistence, type LifecycleWritePoint } from './session-commands';
import { InMemoryDispatchClaimStore, InMemoryTaskRepository } from './test-support/inmemory-store';
import { OptimisticConcurrencyError } from './repository';

const now = new Date('2026-11-08T00:00:00.000Z');
const task: Task = {
  id: taskId('task-1'), workflowId: workflowId('workflow-1'), state: 'READY', dependencyIds: [],
  requiredCapabilities: [], outputContract: 'result', budget: { maxTokens: 100, maxCostUsd: 1 },
  recoveryCycles: 0, projectId: 'project-1', parentTaskId: null, ownerAgentDefinitionId: null,
  deadline: null, traceId: correlationId('trace-1'), version: 0, createdAt: now, updatedAt: now
};

const setup = (options: { dependentCleanupPending?: () => boolean; workflowActive?: boolean; failAt?: LifecycleWritePoint } = {}) => {
  const tasks = new InMemoryTaskRepository();
  const sessions = new InMemoryAgentSessionRepository();
  const lifecycle = new InMemorySessionLifecyclePersistence(tasks, sessions, { failAt: (point) => { if (options.failAt === point) throw new Error(`injected ${point} failure`); } });
  const claims = new InMemoryDispatchClaimStore(tasks);
  const checkpoints = lifecycle;
  const lifecyclePort = lifecycle;
  const manager = new AgentSessionManagerService({
    taskRepository: tasks, sessionRepository: sessions, checkpointStore: checkpoints,
    lifecyclePersistence: lifecyclePort,
    dispatchClaims: claims,
    workflowStatus: { async isActive() { return options.workflowActive ?? true; } },
    clock: { now: () => new Date(now) },
    idFactory: (attempt) => agentSessionId(`session-${attempt}`),
    hasPendingCleanup: options.dependentCleanupPending
  });
  const lease = async (leaseId = 'lease-1', expiresAt = new Date(now.getTime() + 60_000), version = 0, agent = agentDefinitionId('agent-1')) => {
    await claims.claimDispatch({ taskId: task.id, taskVersion: version, taskState: 'READY', workerId: 'worker-1',
      agentDefinitionId: agent, sessionId: agentSessionId('session-1'), leaseId,
      now, expiresAt });
  };
  return { tasks, sessions, checkpoints, lifecycle, claims, get commands() { return lifecycle.listCommands(); }, manager, lease };
};

describe('agent session lifecycle', () => {
  it('starts a leased task and creates a durable session', async () => {
    const h = setup();
    await h.tasks.save(task, 0);
    await h.lease();
    const started = await h.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, expectedTaskVersion: 0, idempotencyKey: 'session:session-1' });
    expect(started.state).toBe('RUNNING');
    expect(started.sessionId).toBe('session-1');
    expect((await h.tasks.get(task.id))?.state).toBe('RUNNING');
    expect(h.commands).toHaveLength(1);
  });

  it('checkpoints after an event and resumes with the same identity and completed operation keys', async () => {
    const h = setup();
    await h.tasks.save(task, 0);
    await h.lease();
    const started = await h.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, expectedTaskVersion: 0, idempotencyKey: 'session:session-1' });
    const checkpoint = await h.manager.checkpoint({ sessionId: started.sessionId, expectedSequence: 0, expectedSessionVersion: 0, idempotencyKey: 'checkpoint:one', state: 'WAITING_FOR_TOOL', contextReference: 'ctx:1', lastEventId: eventId('event-1'), completedOperationKeys: ['tool:charge:1'] });
    expect(checkpoint.sequence).toBe(1);
    await h.manager.pause(started.sessionId, 'checkpoint', { expectedVersion: 1, idempotencyKey: 'pause:checkpoint' });
    const resumed = await h.manager.resume(started.sessionId, { expectedVersion: 2, attempt: 2, idempotencyKey: 'resume:session-1:2' });
    expect(resumed.sessionId).toBe(started.sessionId);
    expect(resumed.attempt).toBe(2);
    expect(h.commands).toHaveLength(2);
    expect(h.commands[1].payload.completedOperationKeys).toContain('tool:charge:1');
    expect(h.lifecycle.listEvents().map((entry) => entry.eventType)).toContain('AGENT_SESSION_RESUMED');
  });

  it('pauses without changing task state and makes duplicate pause idempotent', async () => {
    const h = setup(); await h.tasks.save(task, 0); await h.lease();
    const session = await h.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, expectedTaskVersion: 0, idempotencyKey: 'session:session-1' });
    await h.manager.pause(session.sessionId, 'operator request', { expectedVersion: 0, idempotencyKey: 'pause:operator' });
    await h.manager.pause(session.sessionId, 'operator request', { expectedVersion: 0, idempotencyKey: 'pause:operator' });
    expect((await h.sessions.get(session.sessionId))?.state).toBe('PAUSED');
    expect((await h.tasks.get(task.id))?.state).toBe('RUNNING');
  });

  it('blocks cancellation while dependent cleanup is pending and cancels atomically otherwise', async () => {
    const blocked = setup({ dependentCleanupPending: () => true }); await blocked.tasks.save(task, 0); await blocked.lease();
    const first = await blocked.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, expectedTaskVersion: 0, idempotencyKey: 'session:session-1' });
    await expect(blocked.manager.cancel(first.sessionId, 'stop', { expectedVersion: 0, idempotencyKey: 'cancel:stop' })).rejects.toThrow(/cleanup/i);
    expect((await blocked.tasks.get(task.id))?.state).toBe('RUNNING');

    const h = setup(); await h.tasks.save(task, 0); await h.lease();
    const second = await h.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, expectedTaskVersion: 0, idempotencyKey: 'session:session-1' });
    await h.manager.cancel(second.sessionId, 'stop', { expectedVersion: 0, idempotencyKey: 'cancel:stop' });
    await h.manager.cancel(second.sessionId, 'stop', { expectedVersion: 0, idempotencyKey: 'cancel:stop' });
    expect((await h.sessions.get(second.sessionId))?.state).toBe('CANCELLED');
    expect((await h.tasks.get(task.id))?.state).toBe('CANCELLED');
  });

  it('does not resume a cancelled session', async () => {
    const h = setup(); await h.tasks.save(task, 0); await h.lease();
    const session = await h.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, expectedTaskVersion: 0, idempotencyKey: 'session:session-1' });
    await h.manager.cancel(session.sessionId, 'stop', { expectedVersion: 0, idempotencyKey: 'cancel:stop' });
    await expect(h.manager.resume(session.sessionId, { expectedVersion: 1, attempt: 2, idempotencyKey: 'resume:session-1:2' })).rejects.toThrow(/cancelled/i);
  });

  it('rejects missing, stale, and wrong dispatch leases', async () => {
    const h = setup(); await h.tasks.save(task, 0);
    await expect(h.manager.start({ taskId: task.id, leaseId: 'arbitrary', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, expectedTaskVersion: 0, idempotencyKey: 'session:x' })).rejects.toThrow(/lease/i);
    await h.lease('valid', new Date(now.getTime() - 1));
    await expect(h.manager.start({ taskId: task.id, leaseId: 'valid', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, expectedTaskVersion: 0, idempotencyKey: 'session:x' })).rejects.toThrow(/lease/i);
    const wrong = setup(); await wrong.tasks.save(task, 0); await wrong.lease('actual');
    await expect(wrong.manager.start({ taskId: task.id, leaseId: 'other', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, expectedTaskVersion: 0, idempotencyKey: 'session:x' })).rejects.toThrow(/lease/i);
  });

  it('rejects inactive workflows and stale task versions', async () => {
    const h = setup({ workflowActive: false }); await h.tasks.save(task, 0); await h.lease();
    await expect(h.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, expectedTaskVersion: 0, idempotencyKey: 'session:x' })).rejects.toThrow(/workflow/i);
    const active = setup(); await active.tasks.save(task, 0); await active.lease();
    await expect(active.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, idempotencyKey: 'session:x', expectedTaskVersion: 2 })).rejects.toBeInstanceOf(OptimisticConcurrencyError);
  });

  it('atomically rolls back checkpoint writes that fail after map mutation', async () => {
    const h = setup({ failAt: 'checkpoint' }); await h.tasks.save(task, 0); await h.lease();
    const session = await h.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, expectedTaskVersion: 0, idempotencyKey: 'session:session-1' });
    await expect(h.manager.checkpoint({ sessionId: session.sessionId, expectedSequence: 0, expectedSessionVersion: 0, idempotencyKey: 'ckpt', state: 'WAITING_FOR_TOOL', contextReference: 'ctx', lastEventId: eventId('e1'), completedOperationKeys: ['op'] })).rejects.toThrow(/checkpoint/i);
    expect((await h.sessions.get(session.sessionId))?.version).toBe(0);
    expect(await h.lifecycle.latest(session.sessionId)).toBeNull();
  });

  it('rejects a checkpoint with a stale session version and keeps completed keys monotonic', async () => {
    const h = setup(); await h.tasks.save(task, 0); await h.lease();
    const session = await h.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, expectedTaskVersion: 0, idempotencyKey: 'session:session-1' });
    await h.manager.checkpoint({ sessionId: session.sessionId, expectedSequence: 0, expectedSessionVersion: 0, idempotencyKey: 'ck1', state: 'WAITING_FOR_TOOL', contextReference: 'ctx', lastEventId: eventId('e1'), completedOperationKeys: ['charged'] });
    await expect(h.manager.checkpoint({ sessionId: session.sessionId, expectedSequence: 1, expectedSessionVersion: 0, idempotencyKey: 'ck2', state: 'RUNNING', contextReference: 'ctx2', lastEventId: eventId('e2'), completedOperationKeys: [] })).rejects.toBeInstanceOf(OptimisticConcurrencyError);
    expect((await h.lifecycle.latest(session.sessionId))?.completedOperationKeys).toEqual(['charged']);
  });

  it('returns the stored checkpoint for an exact retry using the original session version', async () => {
    const h = setup(); await h.tasks.save(task, 0); await h.lease();
    const session = await h.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, expectedTaskVersion: 0, idempotencyKey: 'session:session-1' });
    const input = { sessionId: session.sessionId, expectedSequence: 0, expectedSessionVersion: 0, idempotencyKey: 'checkpoint:retry',
      state: 'WAITING_FOR_TOOL' as const, contextReference: 'ctx', lastEventId: eventId('checkpoint-event'), completedOperationKeys: ['charge:1'] };
    const saved = await h.manager.checkpoint(input);
    const eventCount = h.lifecycle.listEvents().length;
    const current = await h.sessions.get(session.sessionId);
    await expect(h.manager.checkpoint(input)).resolves.toEqual(saved);
    expect((await h.sessions.get(session.sessionId))?.version).toBe(current?.version);
    expect(h.lifecycle.listEvents()).toHaveLength(eventCount);
    await expect(h.manager.checkpoint({ ...input, contextReference: 'changed' })).rejects.toThrow(/different input/i);
  });

  it('makes resume idempotent for repeated and concurrent calls and publishes once', async () => {
    const h = setup(); await h.tasks.save(task, 0); await h.lease();
    const session = await h.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, expectedTaskVersion: 0, idempotencyKey: 'session:session-1' });
    await h.manager.checkpoint({ sessionId: session.sessionId, expectedSequence: 0, expectedSessionVersion: 0, idempotencyKey: 'ck1', state: 'PAUSED', contextReference: 'ctx', lastEventId: eventId('e1'), completedOperationKeys: ['op'] });
    const resumeOptions = { expectedVersion: 1, attempt: 2, idempotencyKey: 'resume:session-1:2' };
    const results = await Promise.all([h.manager.resume(session.sessionId, resumeOptions), h.manager.resume(session.sessionId, resumeOptions)]);
    expect(results.every((item) => item.state === 'RUNNING' && item.attempt === 2)).toBe(true);
    expect(h.commands).toHaveLength(2);
    expect(await h.manager.resume(session.sessionId, resumeOptions)).toEqual(results[0]);
    expect(h.commands).toHaveLength(2);
    await expect(h.manager.resume(session.sessionId, { ...resumeOptions, expectedVersion: 2 })).rejects.toThrow(/different input/i);
    await expect(h.manager.resume(session.sessionId, { ...resumeOptions, attempt: 3 })).rejects.toThrow(/different input/i);
  });

  it('rejects stale expected session versions without publishing a command', async () => {
    const h = setup(); await h.tasks.save(task, 0); await h.lease();
    const session = await h.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, expectedTaskVersion: 0, idempotencyKey: 'session:session-1' });
    await h.manager.checkpoint({ sessionId: session.sessionId, expectedSequence: 0, expectedSessionVersion: 0, idempotencyKey: 'ck1', state: 'PAUSED', contextReference: 'ctx', lastEventId: eventId('e1'), completedOperationKeys: ['op'] });
    await expect(h.manager.resume(session.sessionId, { expectedVersion: 0, attempt: 2, idempotencyKey: 'resume:session-1:2' })).rejects.toBeInstanceOf(OptimisticConcurrencyError);
    expect(h.commands).toHaveLength(1);
  });

  it.each([
    ['start', 'session'], ['transition', 'event'], ['cancel', 'event']
  ] as const)('rolls back %s transaction after injected %s failure', async (operation, failAt) => {
    const h = setup({ failAt }); await h.tasks.save(task, 0); await h.lease();
    if (operation === 'start') {
      await expect(h.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, expectedTaskVersion: 0, idempotencyKey: 'session:session-1' })).rejects.toThrow(/injected/i);
      expect((await h.tasks.get(task.id))?.state).toBe('READY');
      expect(await h.sessions.findByTask(task.id, 'session:session-1')).toBeNull();
    } else {
      const isolated = setup(); await isolated.tasks.save(task, 0); await isolated.lease();
      const session = await isolated.manager.start({ taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, expectedTaskVersion: 0, idempotencyKey: 'session:session-1' });
      const failing = new InMemorySessionLifecyclePersistence(isolated.tasks, isolated.sessions, { failAt: () => { throw new Error(`injected ${failAt} failure`); } });
      const broken = new AgentSessionManagerService({
        taskRepository: isolated.tasks, sessionRepository: isolated.sessions, checkpointStore: failing, lifecyclePersistence: failing,
        dispatchClaims: isolated.claims, workflowStatus: { async isActive() { return true; } }, clock: { now: () => new Date(now) }
      });
      if (operation === 'transition') await expect(broken.pause(session.sessionId, 'hold', { expectedVersion: 0, idempotencyKey: 'pause:hold' })).rejects.toThrow(/injected/i);
      else await expect(broken.cancel(session.sessionId, 'stop', { expectedVersion: 0, idempotencyKey: 'cancel:stop' })).rejects.toThrow(/injected/i);
      expect((await isolated.sessions.get(session.sessionId))?.state).toBe('RUNNING');
      expect((await isolated.tasks.get(task.id))?.state).toBe('RUNNING');
    }
    expect(h.lifecycle.listEvents()).toHaveLength(0);
    expect(h.lifecycle.listCommands()).toHaveLength(0);
  });

  it('returns a stored session for duplicate start and rejects changed duplicate lifecycle commands', async () => {
    const h = setup(); await h.tasks.save(task, 0); await h.lease();
    const input = { taskId: task.id, leaseId: 'lease-1', agentDefinitionId: agentDefinitionId('agent-1'), correlationId: task.traceId, expectedTaskVersion: 0, idempotencyKey: 'session:session-1' };
    const started = await h.manager.start(input);
    await expect(h.manager.start(input)).resolves.toEqual(started);
    await h.manager.pause(started.sessionId, 'hold', { expectedVersion: 0, idempotencyKey: 'pause:key' });
    await expect(h.manager.pause(started.sessionId, 'changed', { expectedVersion: 0, idempotencyKey: 'pause:key' })).rejects.toThrow(/different input/i);
  });
});

