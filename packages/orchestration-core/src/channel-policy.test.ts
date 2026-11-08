import { describe, expect, it } from 'vitest';
import { agentSessionId, taskId, type ActorRef } from '@aicompany/contracts';
import { ChannelAuthorizationError, InMemoryChannelAuthorization } from './channel-policy';

const task = taskId('task-1');
const project = 'project-1';
const agent = (sessionId: string): ActorRef => ({ kind: 'AGENT', sessionId: agentSessionId(sessionId) });
const owner = agent('owner');
const supervisor = agent('supervisor');
const invited = agent('invited');
const stranger = agent('stranger');

describe('InMemoryChannelAuthorization', () => {
  it('allows an assignee, supervisor, and invited peer to write to a task channel', async () => {
    const policy = new InMemoryChannelAuthorization({
      tasks: [{ taskId: task, projectId: project, assignee: owner, supervisors: [supervisor], invited: [invited] }],
      projectAssignments: [], cancelledSessions: []
    });
    for (const actor of [owner, supervisor, invited]) {
      await expect(policy.authorizeWrite(actor, { kind: 'task', taskId: task })).resolves.toBeUndefined();
    }
    await expect(policy.authorizeWrite(stranger, { kind: 'task', taskId: task })).rejects.toBeInstanceOf(ChannelAuthorizationError);
  });

  it('allows project reads only to assigned agents and rejects cross-project reads', async () => {
    const policy = new InMemoryChannelAuthorization({
      tasks: [{ taskId: task, projectId: project, assignee: owner, supervisors: [], invited: [] }],
      projectAssignments: [{ projectId: project, actor: owner }], cancelledSessions: []
    });
    await expect(policy.authorizeRead(owner, { kind: 'project', projectId: project })).resolves.toBeUndefined();
    await expect(policy.authorizeRead(stranger, { kind: 'project', projectId: project })).rejects.toBeInstanceOf(ChannelAuthorizationError);
    await expect(policy.authorizeRead(owner, { kind: 'project', projectId: 'project-2' })).rejects.toBeInstanceOf(ChannelAuthorizationError);
  });

  it('rejects cancelled sessions and does not provide an unscoped broadcast authorization', async () => {
    const policy = new InMemoryChannelAuthorization({
      tasks: [{ taskId: task, projectId: project, assignee: owner, supervisors: [], invited: [] }],
      projectAssignments: [{ projectId: project, actor: owner }], cancelledSessions: [owner.sessionId]
    });
    await expect(policy.authorizeWrite(owner, { kind: 'task', taskId: task })).rejects.toThrow(/cancelled/i);
    await expect(policy.authorizeRead(owner, { kind: 'project', projectId: project })).rejects.toThrow(/cancelled/i);
  });
});
