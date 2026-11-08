import { describe, expect, it } from 'vitest';
import { agentSessionId, correlationId, eventId, taskId, type DomainEvent } from '@aicompany/contracts';
import { InMemoryChannelAuthorization } from './channel-policy';
import { InMemoryCommunicationService, InMemoryDomainEventPublisher, InMemoryMessageStore } from './communication';
import { InMemoryDecisionRecordService, InMemoryDecisionRecordStore } from './decision-records';

const actor = { kind: 'AGENT' as const, sessionId: agentSessionId('session-1') };
const scope = { kind: 'task' as const, taskId: taskId('task-1') };
const makeService = () => {
  const authorization = new InMemoryChannelAuthorization({
    tasks: [{ taskId: scope.taskId, projectId: 'project-1', assignee: actor, supervisors: [], invited: [] }],
    projectAssignments: [{ projectId: 'project-1', actor }], cancelledSessions: []
  });
  const publisher = new InMemoryDomainEventPublisher();
  return { service: new InMemoryCommunicationService(new InMemoryMessageStore(), authorization, publisher, { newMessageId: () => 'message-1', reader: () => actor }), publisher };
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
});

describe('decision records', () => {
  it('stores decisions separately with evidence, correlation, causation, author session, and supersession', async () => {
    const store = new InMemoryDecisionRecordStore();
    const service = new InMemoryDecisionRecordService(store, { newDecisionId: () => 'decision-1' });
    const record = await service.record({ actor, scope, subject: 'Transport', options: ['in-memory', 'external'], selectedOption: 'in-memory', rationale: 'Production transport is not ready', evidenceIds: ['artifact://design/1'], correlationId: correlationId('trace-1'), causationId: eventId('cause-1'), supersedesDecisionId: 'decision-0' });
    expect(record).toMatchObject({ decisionId: 'decision-1', actor, subject: 'Transport', evidenceIds: ['artifact://design/1'], causationId: 'cause-1', supersedesDecisionId: 'decision-0' });
    await expect(store.list(scope)).resolves.toEqual([record]);
  });

  it('rejects decisions that select an option not considered', async () => {
    const service = new InMemoryDecisionRecordService(new InMemoryDecisionRecordStore(), { newDecisionId: () => 'decision-1' });
    await expect(service.record({ actor, scope, subject: 'Transport', options: ['memory'], selectedOption: 'external', rationale: 'Not considered', evidenceIds: [], correlationId: correlationId('trace-1'), causationId: eventId('cause-1') })).rejects.toThrow(/selected/i);
  });
});
