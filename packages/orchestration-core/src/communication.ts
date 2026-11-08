import {
  ActorRefSchema,
  CorrelationIdSchema,
  DomainEventSchema,
  EventIdSchema,
  TaskIdSchema,
  type ActorRef,
  type CorrelationId,
  type DomainEvent,
  type EventId
} from '@aicompany/contracts';
import { ChannelAuthorizationError, type ChannelAuthorization, type ChannelScope } from './channel-policy.js';

export type { ChannelScope } from './channel-policy.js';
export type MessageType = 'CHAT' | 'PROGRESS' | 'HANDOFF' | 'BLOCKER';

export interface SendMessageInput {
  actor: ActorRef;
  scope: ChannelScope;
  messageType: MessageType;
  contentReference: string;
  correlationId: CorrelationId;
  causationId: EventId;
}

export interface Message extends SendMessageInput {
  messageId: string;
  createdAt: Date;
}

export interface CommunicationService {
  sendMessage(input: SendMessageInput): Promise<Message>;
  publishEvent(event: DomainEvent): Promise<void>;
  listMessages(scope: ChannelScope, after?: string): Promise<Message[]>;
}

export interface MessageStore {
  append(message: Message, idempotencyKey: string): Promise<Message>;
  list(scope: ChannelScope, after?: string): Promise<Message[]>;
}

export interface DomainEventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

export class InMemoryDomainEventPublisher implements DomainEventPublisher {
  private readonly events = new Map<string, DomainEvent>();

  public async publish(event: DomainEvent): Promise<void> {
    const parsed = DomainEventSchema.parse(event);
    const prior = this.events.get(parsed.eventId);
    if (prior) {
      if (stableJson(prior) !== stableJson(parsed)) throw new Error(`Event ID ${parsed.eventId} was reused with different content`);
      return;
    }
    this.events.set(parsed.eventId, structuredClone(parsed));
  }

  public publishedEvents(): DomainEvent[] {
    return [...this.events.values()].map((event) => structuredClone(event));
  }
}

export interface CommunicationOptions {
  newMessageId: () => string;
  reader: () => ActorRef;
  eventScopeResolver?: (event: DomainEvent) => ChannelScope;
  now?: () => Date;
}

const keyFor = (scope: ChannelScope): string => scope.kind === 'task'
  ? `task:${TaskIdSchema.parse(scope.taskId)}`
  : `project:${scope.projectId.trim()}`;

const cloneMessage = (message: Message): Message => ({ ...message, scope: { ...message.scope }, actor: { ...message.actor }, createdAt: new Date(message.createdAt) });
const stableJson = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => item instanceof Date ? item.toISOString() : item);
const secretLike = (reference: string): boolean => /(?:password|passwd|secret|api[_-]?key|access[_-]?token|private[_-]?key)\s*[:=]\s*\S+/i.test(reference);

export class InMemoryMessageStore implements MessageStore {
  private readonly messages: Message[] = [];
  private readonly idempotency = new Map<string, { fingerprint: string; message: Message }>();

  public async append(message: Message, idempotencyKey: string): Promise<Message> {
    const fingerprint = stableJson({ ...message, messageId: undefined, createdAt: undefined });
    const prior = this.idempotency.get(idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new Error('Message idempotency key was reused with different content');
      return cloneMessage(prior.message);
    }
    const stored = cloneMessage(message);
    this.messages.push(stored);
    this.idempotency.set(idempotencyKey, { fingerprint, message: stored });
    return cloneMessage(stored);
  }

  public async list(scope: ChannelScope, after?: string): Promise<Message[]> {
    const matching = this.messages.filter((message) => keyFor(message.scope) === keyFor(scope));
    const start = after === undefined ? 0 : Math.max(0, matching.findIndex((message) => message.messageId === after) + 1);
    return matching.slice(start).map(cloneMessage);
  }
}

export class InMemoryCommunicationService implements CommunicationService {
  public constructor(
    private readonly store: MessageStore,
    private readonly authorization: ChannelAuthorization,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly options: CommunicationOptions
  ) {}

  public async sendMessage(input: SendMessageInput): Promise<Message> {
    await this.authorization.authorizeWrite(input.actor, input.scope);
    const actor = ActorRefSchema.parse(input.actor);
    const scope = input.scope.kind === 'task'
      ? { kind: 'task' as const, taskId: TaskIdSchema.parse(input.scope.taskId) }
      : { kind: 'project' as const, projectId: input.scope.projectId.trim() };
    const reference = input.contentReference.trim();
    if (reference.length === 0 || secretLike(reference)) throw new ChannelAuthorizationError('Message content must be a safe artifact or content reference');
    const messageType = input.messageType;
    if (!['CHAT', 'PROGRESS', 'HANDOFF', 'BLOCKER'].includes(messageType)) throw new Error('Unknown message type');
    const correlation = CorrelationIdSchema.parse(input.correlationId);
    const causation = EventIdSchema.parse(input.causationId);
    const idempotencyKey = `${keyFor(scope)}:${actor.kind === 'AGENT' ? actor.sessionId : actor.kind}:${causation}:${messageType}`;
    const message: Message = {
      messageId: this.options.newMessageId(), actor, scope, messageType, contentReference: reference,
      correlationId: correlation, causationId: causation, createdAt: (this.options.now ?? (() => new Date()))()
    };
    return this.store.append(message, idempotencyKey);
  }

  public async publishEvent(event: DomainEvent): Promise<void> {
    const parsed = DomainEventSchema.parse(event);
    const scope = parsed.aggregateType === 'TASK'
      ? { kind: 'task' as const, taskId: TaskIdSchema.parse(parsed.aggregateId) }
      : this.options.eventScopeResolver?.(parsed);
    if (!scope) throw new Error(`An event scope resolver is required for ${parsed.aggregateType} events`);
    await this.authorization.authorizeWrite(parsed.actor, scope);
    await this.eventPublisher.publish(parsed);
  }

  public async listMessages(scope: ChannelScope, after?: string): Promise<Message[]> {
    await this.authorization.authorizeRead(this.options.reader(), scope);
    return this.store.list(scope, after);
  }

}
