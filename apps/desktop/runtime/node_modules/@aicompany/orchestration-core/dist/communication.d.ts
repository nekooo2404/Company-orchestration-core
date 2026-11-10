import { type ActorRef, type CorrelationId, type DomainEvent, type EventId } from '@aicompany/contracts';
import { type ChannelAuthorization, type ChannelScope } from './channel-policy.js';
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
export declare class InMemoryDomainEventPublisher implements DomainEventPublisher {
    private readonly events;
    publish(event: DomainEvent): Promise<void>;
    publishedEvents(): DomainEvent[];
}
export interface CommunicationOptions {
    newMessageId: () => string;
    reader: () => ActorRef;
    eventScopeResolver?: (event: DomainEvent) => ChannelScope;
    now?: () => Date;
}
export declare class InMemoryMessageStore implements MessageStore {
    private readonly messages;
    private readonly idempotency;
    append(message: Message, idempotencyKey: string): Promise<Message>;
    list(scope: ChannelScope, after?: string): Promise<Message[]>;
}
export declare class InMemoryCommunicationService implements CommunicationService {
    private readonly store;
    private readonly authorization;
    private readonly eventPublisher;
    private readonly options;
    constructor(store: MessageStore, authorization: ChannelAuthorization, eventPublisher: DomainEventPublisher, options: CommunicationOptions);
    sendMessage(input: SendMessageInput): Promise<Message>;
    publishEvent(event: DomainEvent): Promise<void>;
    listMessages(scope: ChannelScope, after?: string): Promise<Message[]>;
}
//# sourceMappingURL=communication.d.ts.map