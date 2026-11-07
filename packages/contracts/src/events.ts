import { z } from 'zod';
import {
  CorrelationIdSchema,
  EventIdSchema,
  type EventId
} from './ids';
import { ActorRefSchema, type ActorRef } from './agent';

export const EventTypeSchema = z.enum([
  'TASK_CREATED',
  'TASK_READY',
  'TASK_STARTED',
  'TASK_PROGRESS',
  'REVIEW_REQUESTED',
  'TASK_REVIEW_REQUESTED',
  'ARTIFACT_CREATED',
  'BLOCKED',
  'TASK_BLOCKED',
  'TASK_FAILED',
  'RECOVERY_STARTED',
  'TASK_COMPLETED',
  'DEPLOYMENT_APPROVAL_REQUESTED',
  'APPROVAL_REQUESTED',
  'TASK_ESCALATED',
  'TASK_CANCELLED',
  'AGENT_SESSION_CREATED',
  'AGENT_SESSION_STARTED',
  'AGENT_SESSION_PAUSED',
  'AGENT_SESSION_RESUMED',
  'AGENT_SESSION_COMPLETED',
  'AGENT_SESSION_FAILED',
  'AGENT_SESSION_CANCELLED',
  'APPROVAL_APPROVED',
  'APPROVAL_REJECTED'
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const EventPayloadSchema = z.record(z.unknown());
export type EventPayload = z.infer<typeof EventPayloadSchema>;

export const DomainEventSchema = z.object({
  eventId: EventIdSchema,
  aggregateType: z.string().refine((value) => value.trim().length > 0),
  aggregateId: z.string().refine((value) => value.trim().length > 0),
  aggregateVersion: z.number().int().positive(),
  eventType: EventTypeSchema,
  actor: ActorRefSchema,
  correlationId: CorrelationIdSchema,
  causationId: EventIdSchema.nullable(),
  occurredAt: z.date(),
  payload: EventPayloadSchema
});
export type DomainEvent = z.infer<typeof DomainEventSchema>;

export const CommandTypeSchema = z.enum([
  'START_AGENT_SESSION',
  'START_RECOVERY',
  'REQUEST_APPROVAL',
  'DEPLOY'
]);
export type CommandType = z.infer<typeof CommandTypeSchema>;

export const OutboxCommandSchema = z.object({
  commandId: z.string().refine((value) => value.trim().length > 0),
  type: CommandTypeSchema,
  payload: EventPayloadSchema,
  availableAt: z.date(),
  correlationId: CorrelationIdSchema.optional(),
  causationId: EventIdSchema.nullable().optional(),
  claimedBy: z.string().nullable().optional(),
  claimedAt: z.date().nullable().optional(),
  completedAt: z.date().nullable().optional()
});
export type OutboxCommand = z.infer<typeof OutboxCommandSchema>;

export type EventActor = ActorRef;
export type EventCausationId = EventId;
