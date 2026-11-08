import { describe, expect, it } from 'vitest';
import { agentSessionId, correlationId, eventId, taskId, type DomainEvent } from '@aicompany/contracts';
import { InMemoryChannelAuthorization } from './channel-policy';
import { InMemoryCommunicationService, InMemoryDomainEventPublisher, InMemoryMessageStore } from './communication';
import { InMemoryDecisionRecordService, InMemoryDecisionRecordStore } from './decision-records';
import type { ChannelScope } from './channel-policy';

const actor = { kind: 'AGENT' as const, sessionId: agentSessionId('session-1') };
const scope = { kind: 'task' as const, taskId: taskId('task-1') };
const makeService = (eventScopeResolver?: (event: DomainEvent) => ChannelScope) => {
  const authorization = new InMemoryChannelAuthorization({
    tasks: [{ taskId: scope.taskId, projectId: 'project-1', assignee: actor, supervisors: [], invited: [] }],
    projectAssignments: [{ projectId: 'project-1', actor }], cancelledSessions: []
  });
  const publisher = new InMemoryDomainEventPublisher();
  return { service: new InMemoryCommunicationService(new InMemoryMessageStore(), authorization, publisher, { newMessageId: () => 'message-1', reader: () => actor, eventScopeResolver }), publisher, authorization };
};
const validEvent: DomainEvent = {
  eventId: eventId('event-1'), aggregateType: 'TASK', aggregateId: 'task-1', aggregateVersion: 1,
  eventType: 'TASK_PROGRESS', actor, correlationId: correlationId('trace-1'), causationId: eventId('cause-1'),
  occurredAt: new Date('2026-11-08T00:00:00.000Z'), payload: { taskId: scope.taskId, progress: 'started' }
};

describe('scoped communication', () => {
  it('persists scoped message provenance and returns messages only to authorized readers', async () => {
    const { service } = makeService();
    const message = await service.sendMessage({ actor, scope, messageType: 'PROGRESS', contentReference: 'artifact://progress/1', correlationId: correlationId('trace-1'), causationId: eventId('cause-1') });
    expect(message).toMatchObject({ actor, scope, correlationId: 'trace-1', causationId: 'cause-1' });
    await expect(service.sendMessage({ actor, scope, messageType: 'PROGRESS', contentReference: 'artifact://progress/1', correlationId: correlationId('trace-1'), causationId: eventId('cause-1') })).resolves.toEqual(message);
    await expect(service.sendMessage({ actor, scope, messageType: 'PROGRESS', contentReference: 'artifact://progress/changed', correlationId: correlationId('trace-1'), causationId: eventId('cause-1') })).rejects.toThrow(/idempotency/i);
    await expect(service.sendMessage({ actor, scope, messageType: 'PROGRESS', contentReference: 'artifact://progress/1', correlationId: correlationId('trace-2'), causationId: eventId('cause-1') })).rejects.toThrow(/idempotency/i);
    await expect(service.listMessages(scope)).resolves.toEqual([message]);
    await expect(service.listMessages({ kind: 'project', projectId: 'other-project' })).rejects.toThrow();
  });

  it('rejects raw secret content instead of persisting it', async () => {
    const { service } = makeService();
    await expect(service.sendMessage({ actor, scope, messageType: 'CHAT', contentReference: 'password=top-secret-value', correlationId: correlationId('trace-1'), causationId: eventId('cause-1') })).rejects.toThrow(/reference|secret/i);
  });

  it('validates events and publishes identical event IDs only once', async () => {
    const { service, publisher } = makeService();
    await service.publishEvent(validEvent);
    await service.publishEvent(validEvent);
    expect(publisher.publishedEvents()).toEqual([validEvent]);
    await expect(service.publishEvent({ ...validEvent, payload: {} } as DomainEvent)).rejects.toThrow();
    await expect(service.publishEvent({ ...validEvent, payload: { taskId: scope.taskId, progress: 'different' } })).rejects.toThrow(/id/i);
    await expect(service.publishEvent({ ...validEvent, eventType: 'UNRECOGNIZED' } as never)).rejects.toThrow();
  });

  it('authorizes a task event actor before publishing it', async () => {
    const { service, publisher } = makeService();
    const unauthorizedEvent = { ...validEvent, actor: { kind: 'AGENT' as const, sessionId: agentSessionId('stranger') } };
    await expect(service.publishEvent(unauthorizedEvent)).rejects.toThrow(/authorized/i);
    expect(publisher.publishedEvents()).toEqual([]);
  });

  it('requires an explicit scope resolver for non-task event aggregates', async () => {
    const { service } = makeService();
    const otherAggregateEvent = { ...validEvent, aggregateType: 'WORKFLOW' };
    await expect(service.publishEvent(otherAggregateEvent)).rejects.toThrow(/resolver/i);
    const resolved = makeService(() => ({ kind: 'project', projectId: 'project-1' }));
    await expect(resolved.service.publishEvent(otherAggregateEvent)).resolves.toBeUndefined();
  });
});

describe('decision records', () => {
  it('stores decisions separately with evidence, correlation, causation, author session, and supersession', async () => {
    const { authorization } = makeService();
    const store = new InMemoryDecisionRecordStore(authorization);
    let generated = 0;
    const service = new InMemoryDecisionRecordService(store, authorization, { newDecisionId: () => `decision-${++generated}` });
    const record = await service.record({ actor, scope, idempotencyKey: 'decision-key-1', subject: 'Transport', options: ['in-memory', 'external'], selectedOption: 'in-memory', rationale: 'Production transport is not ready', evidenceIds: ['artifact://design/1'], correlationId: correlationId('trace-1'), causationId: eventId('cause-1'), supersedesDecisionId: 'decision-0' });
    expect(record).toMatchObject({ decisionId: 'decision-1', actor, subject: 'Transport', evidenceIds: ['artifact://design/1'], causationId: 'cause-1', supersedesDecisionId: 'decision-0' });
    await expect(service.list(actor, scope)).resolves.toEqual([record]);
    await expect(service.list({ kind: 'AGENT', sessionId: agentSessionId('stranger') }, scope)).rejects.toThrow(/authorized/i);
    const retried = await service.record({ actor, scope, idempotencyKey: 'decision-key-1', subject: 'Transport', options: ['in-memory', 'external'], selectedOption: 'in-memory', rationale: 'Production transport is not ready', evidenceIds: ['artifact://design/1'], correlationId: correlationId('trace-1'), causationId: eventId('cause-1'), supersedesDecisionId: 'decision-0' });
    expect(retried).toEqual(record);
    const parallelRetries = await Promise.all([
      service.record({ actor, scope, idempotencyKey: 'decision-key-1', subject: 'Transport', options: ['in-memory', 'external'], selectedOption: 'in-memory', rationale: 'Production transport is not ready', evidenceIds: ['artifact://design/1'], correlationId: correlationId('trace-1'), causationId: eventId('cause-1'), supersedesDecisionId: 'decision-0' }),
      service.record({ actor, scope, idempotencyKey: 'decision-key-1', subject: 'Transport', options: ['in-memory', 'external'], selectedOption: 'in-memory', rationale: 'Production transport is not ready', evidenceIds: ['artifact://design/1'], correlationId: correlationId('trace-1'), causationId: eventId('cause-1'), supersedesDecisionId: 'decision-0' })
    ]);
    expect(parallelRetries).toEqual([record, record]);
    expect(generated).toBe(1);
  });

  it('rejects decisions that select an option not considered', async () => {
    const { authorization } = makeService();
    const service = new InMemoryDecisionRecordService(new InMemoryDecisionRecordStore(authorization), authorization, { newDecisionId: () => 'decision-1' });
    await expect(service.record({ actor, scope, idempotencyKey: 'decision-key-2', subject: 'Transport', options: ['memory'], selectedOption: 'external', rationale: 'Not considered', evidenceIds: [], correlationId: correlationId('trace-1'), causationId: eventId('cause-1') })).rejects.toThrow(/selected/i);
  });

  it('rejects cancelled and cross-project actors and changed requests under one idempotency key', async () => {
    const access = new InMemoryChannelAuthorization({
      tasks: [{ taskId: scope.taskId, projectId: 'project-1', assignee: actor, supervisors: [], invited: [] }],
      projectAssignments: [{ projectId: 'project-1', actor }], cancelledSessions: [actor.sessionId]
    });
    const service = new InMemoryDecisionRecordService(new InMemoryDecisionRecordStore(access), access, { newDecisionId: () => 'decision-1' });
    const input = { actor, scope: { kind: 'project' as const, projectId: 'project-1' }, idempotencyKey: 'decision-key-3', subject: 'Transport', options: ['memory'], selectedOption: 'memory', rationale: 'Reason', evidenceIds: [], correlationId: correlationId('trace-1'), causationId: eventId('cause-1') };
    await expect(service.record(input)).rejects.toThrow(/cancelled/i);
    await expect(service.list(actor, input.scope)).rejects.toThrow(/cancelled/i);

    const activeAccess = new InMemoryChannelAuthorization({
      tasks: [{ taskId: scope.taskId, projectId: 'project-1', assignee: actor, supervisors: [], invited: [] }],
      projectAssignments: [{ projectId: 'project-1', actor }], cancelledSessions: []
    });
    const activeService = new InMemoryDecisionRecordService(new InMemoryDecisionRecordStore(activeAccess), activeAccess, { newDecisionId: () => 'decision-2' });
    await expect(activeService.record({ ...input, scope: { kind: 'project', projectId: 'project-2' } })).rejects.toThrow(/assigned|authorized/i);
    await expect(activeService.list({ kind: 'AGENT', sessionId: agentSessionId('stranger') }, input.scope)).rejects.toThrow(/assigned|authorized/i);
    await activeService.record({ ...input, scope: { kind: 'project', projectId: 'project-1' } });
    await expect(activeService.record({ ...input, scope: { kind: 'project', projectId: 'project-1' }, rationale: 'Changed' })).rejects.toThrow(/idempotency/i);
  });
});
