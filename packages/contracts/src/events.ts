import { z } from 'zod';
import {
  ApprovalIdSchema,
  AgentDefinitionIdSchema,
  AgentSessionIdSchema,
  CorrelationIdSchema,
  EventIdSchema,
  TaskIdSchema,
  WorkflowIdSchema,
  type EventId
} from './ids.js';
import { ActorRefSchema, type ActorRef } from './agent.js';
import { ApprovalSubjectTypeSchema } from './approval.js';

const nonEmptyText = z.string().refine((value) => value.trim().length > 0);
const nonEmptyTextArray = z.array(nonEmptyText).min(1);

export const EventTypeSchema = z.enum([
  'TASK_CREATED',
  'TASK_READY',
  'TASK_STARTED',
  'TASK_PROGRESS',
  'REVIEW_REQUESTED',
  'ARTIFACT_CREATED',
  'BLOCKED',
  'TASK_FAILED',
  'RECOVERY_STARTED',
  'TASK_COMPLETED',
  'DEPLOYMENT_APPROVAL_REQUESTED',
  'DEPLOYMENT_APPROVED',
  'DEPLOYMENT_REJECTED',
  'DEPLOYMENT_RESULT_RECORDED',
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

export const TaskCreatedPayloadSchema = z.object({
  taskId: TaskIdSchema,
  workflowId: WorkflowIdSchema
});
export const TaskReadyPayloadSchema = z.object({ taskId: TaskIdSchema });
export const TaskStartedPayloadSchema = z.object({
  sessionId: AgentSessionIdSchema,
  taskId: TaskIdSchema.optional()
});
export const TaskProgressPayloadSchema = z.object({
  taskId: TaskIdSchema.optional(),
  progress: nonEmptyText.optional(),
  message: nonEmptyText.optional(),
  percent: z.number().min(0).max(100).optional()
}).refine(({ progress, message, percent }) =>
  progress !== undefined || message !== undefined || percent !== undefined
);
export const ReviewRequestedPayloadSchema = z.object({
  taskId: TaskIdSchema,
  evidenceIds: z.array(nonEmptyText).optional()
});
export const ArtifactCreatedPayloadSchema = z.union([
  z.object({ artifactId: nonEmptyText, taskId: TaskIdSchema.optional() }),
  z.object({ artifactReference: nonEmptyText, taskId: TaskIdSchema.optional() })
]);
export const BlockedPayloadSchema = z.object({
  reason: nonEmptyText,
  taskId: TaskIdSchema.optional()
});
export const TaskFailedPayloadSchema = z.object({
  failureFingerprint: nonEmptyText,
  taskId: TaskIdSchema.optional()
});
export const RecoveryStartedPayloadSchema = z.object({
  recoveryId: nonEmptyText,
  taskId: TaskIdSchema.optional()
});
export const TaskCompletedPayloadSchema = z.object({
  evidenceIds: nonEmptyTextArray,
  taskId: TaskIdSchema.optional()
});
export const DeploymentApprovalRequestedPayloadSchema = z.object({
  approvalId: ApprovalIdSchema,
  taskId: TaskIdSchema
});
export const DeploymentApprovedPayloadSchema = z.object({
  approvalId: ApprovalIdSchema,
  taskId: TaskIdSchema
});
export const DeploymentRejectedPayloadSchema = z.object({
  approvalId: ApprovalIdSchema,
  taskId: TaskIdSchema,
  reason: nonEmptyText
});
export const DeploymentResultRecordedPayloadSchema = z.object({
  taskId: TaskIdSchema,
  approvalId: ApprovalIdSchema,
  attemptId: nonEmptyText,
  evidenceIds: nonEmptyTextArray
});
export const ApprovalRequestedPayloadSchema = z.object({
  approvalId: ApprovalIdSchema,
  subjectType: ApprovalSubjectTypeSchema,
  subjectId: nonEmptyText,
  reason: nonEmptyText
});
export const TaskEscalatedPayloadSchema = z.object({
  reason: nonEmptyText,
  taskId: TaskIdSchema.optional()
});
export const TaskCancelledPayloadSchema = z.object({
  reason: nonEmptyText,
  taskId: TaskIdSchema.optional()
});
export const AgentSessionCreatedPayloadSchema = z.object({
  sessionId: AgentSessionIdSchema,
  taskId: TaskIdSchema,
  agentDefinitionId: AgentDefinitionIdSchema
});
export const AgentSessionStartedPayloadSchema = z.object({
  sessionId: AgentSessionIdSchema,
  taskId: TaskIdSchema.optional()
});
export const AgentSessionPausedPayloadSchema = z.object({
  sessionId: AgentSessionIdSchema,
  reason: nonEmptyText
});
export const AgentSessionResumedPayloadSchema = z.object({
  sessionId: AgentSessionIdSchema
});
export const AgentSessionCompletedPayloadSchema = z.object({
  sessionId: AgentSessionIdSchema
});
export const AgentSessionFailedPayloadSchema = z.object({
  sessionId: AgentSessionIdSchema,
  failureFingerprint: nonEmptyText
});
export const AgentSessionCancelledPayloadSchema = z.object({
  sessionId: AgentSessionIdSchema,
  reason: nonEmptyText
});
export const ApprovalApprovedPayloadSchema = z.object({
  approvalId: ApprovalIdSchema,
  decisionReason: nonEmptyText.optional(),
  decidedAt: z.date().optional()
});
export const ApprovalRejectedPayloadSchema = z.object({
  approvalId: ApprovalIdSchema,
  reason: nonEmptyText,
  decisionReason: nonEmptyText.optional()
});

export const EventPayloadSchema = z.union([
  TaskCreatedPayloadSchema,
  TaskReadyPayloadSchema,
  TaskStartedPayloadSchema,
  TaskProgressPayloadSchema,
  ReviewRequestedPayloadSchema,
  ArtifactCreatedPayloadSchema,
  BlockedPayloadSchema,
  TaskFailedPayloadSchema,
  RecoveryStartedPayloadSchema,
  TaskCompletedPayloadSchema,
  DeploymentApprovalRequestedPayloadSchema,
  DeploymentApprovedPayloadSchema,
  DeploymentRejectedPayloadSchema,
  DeploymentResultRecordedPayloadSchema,
  ApprovalRequestedPayloadSchema,
  TaskEscalatedPayloadSchema,
  TaskCancelledPayloadSchema,
  AgentSessionCreatedPayloadSchema,
  AgentSessionStartedPayloadSchema,
  AgentSessionPausedPayloadSchema,
  AgentSessionResumedPayloadSchema,
  AgentSessionCompletedPayloadSchema,
  AgentSessionFailedPayloadSchema,
  AgentSessionCancelledPayloadSchema,
  ApprovalApprovedPayloadSchema,
  ApprovalRejectedPayloadSchema
]);
export type EventPayload = z.infer<typeof EventPayloadSchema>;

const eventAuditFields = {
  eventId: EventIdSchema,
  aggregateType: nonEmptyText,
  aggregateId: nonEmptyText,
  aggregateVersion: z.number().int().positive(),
  actor: ActorRefSchema,
  correlationId: CorrelationIdSchema,
  causationId: EventIdSchema,
  occurredAt: z.date()
};

export const DomainEventSchema = z.discriminatedUnion('eventType', [
  z.object({ ...eventAuditFields, eventType: z.literal('TASK_CREATED'), payload: TaskCreatedPayloadSchema }),
  z.object({ ...eventAuditFields, eventType: z.literal('TASK_READY'), payload: TaskReadyPayloadSchema }),
  z.object({ ...eventAuditFields, eventType: z.literal('TASK_STARTED'), payload: TaskStartedPayloadSchema }),
  z.object({ ...eventAuditFields, eventType: z.literal('TASK_PROGRESS'), payload: TaskProgressPayloadSchema }),
  z.object({ ...eventAuditFields, eventType: z.literal('REVIEW_REQUESTED'), payload: ReviewRequestedPayloadSchema }),
  z.object({ ...eventAuditFields, eventType: z.literal('ARTIFACT_CREATED'), payload: ArtifactCreatedPayloadSchema }),
  z.object({ ...eventAuditFields, eventType: z.literal('BLOCKED'), payload: BlockedPayloadSchema }),
  z.object({ ...eventAuditFields, eventType: z.literal('TASK_FAILED'), payload: TaskFailedPayloadSchema }),
  z.object({ ...eventAuditFields, eventType: z.literal('RECOVERY_STARTED'), payload: RecoveryStartedPayloadSchema }),
  z.object({ ...eventAuditFields, eventType: z.literal('TASK_COMPLETED'), payload: TaskCompletedPayloadSchema }),
  z.object({
    ...eventAuditFields,
    eventType: z.literal('DEPLOYMENT_APPROVAL_REQUESTED'),
    payload: DeploymentApprovalRequestedPayloadSchema
  }),
  z.object({
    ...eventAuditFields,
    eventType: z.literal('DEPLOYMENT_APPROVED'),
    payload: DeploymentApprovedPayloadSchema
  }),
  z.object({
    ...eventAuditFields,
    eventType: z.literal('DEPLOYMENT_REJECTED'),
    payload: DeploymentRejectedPayloadSchema
  }),
  z.object({
    ...eventAuditFields,
    eventType: z.literal('DEPLOYMENT_RESULT_RECORDED'),
    payload: DeploymentResultRecordedPayloadSchema
  }),
  z.object({
    ...eventAuditFields,
    aggregateVersion: z.number().int().nonnegative(),
    eventType: z.literal('APPROVAL_REQUESTED'),
    payload: ApprovalRequestedPayloadSchema
  }),
  z.object({ ...eventAuditFields, eventType: z.literal('TASK_ESCALATED'), payload: TaskEscalatedPayloadSchema }),
  z.object({ ...eventAuditFields, eventType: z.literal('TASK_CANCELLED'), payload: TaskCancelledPayloadSchema }),
  z.object({
    ...eventAuditFields,
    eventType: z.literal('AGENT_SESSION_CREATED'),
    payload: AgentSessionCreatedPayloadSchema
  }),
  z.object({
    ...eventAuditFields,
    eventType: z.literal('AGENT_SESSION_STARTED'),
    payload: AgentSessionStartedPayloadSchema
  }),
  z.object({
    ...eventAuditFields,
    eventType: z.literal('AGENT_SESSION_PAUSED'),
    payload: AgentSessionPausedPayloadSchema
  }),
  z.object({
    ...eventAuditFields,
    eventType: z.literal('AGENT_SESSION_RESUMED'),
    payload: AgentSessionResumedPayloadSchema
  }),
  z.object({
    ...eventAuditFields,
    eventType: z.literal('AGENT_SESSION_COMPLETED'),
    payload: AgentSessionCompletedPayloadSchema
  }),
  z.object({
    ...eventAuditFields,
    eventType: z.literal('AGENT_SESSION_FAILED'),
    payload: AgentSessionFailedPayloadSchema
  }),
  z.object({
    ...eventAuditFields,
    eventType: z.literal('AGENT_SESSION_CANCELLED'),
    payload: AgentSessionCancelledPayloadSchema
  }),
  z.object({
    ...eventAuditFields,
    eventType: z.literal('APPROVAL_APPROVED'),
    payload: ApprovalApprovedPayloadSchema
  }),
  z.object({
    ...eventAuditFields,
    eventType: z.literal('APPROVAL_REJECTED'),
    payload: ApprovalRejectedPayloadSchema
  })
]);
export type DomainEvent = z.infer<typeof DomainEventSchema>;

export const CommandTypeSchema = z.enum([
  'START_AGENT_SESSION',
  'START_RECOVERY',
  'REQUEST_APPROVAL',
  'DEPLOY'
]);
export type CommandType = z.infer<typeof CommandTypeSchema>;

export const StartAgentSessionPayloadSchema = z.object({
  taskId: TaskIdSchema,
  workflowId: WorkflowIdSchema,
  agentDefinitionId: AgentDefinitionIdSchema,
  leaseId: nonEmptyText,
  idempotencyKey: AgentSessionIdSchema,
  attempt: z.number().int().positive().optional(),
  completedOperationKeys: z.array(nonEmptyText).optional()
});
export const StartRecoveryPayloadSchema = z.object({
  taskId: TaskIdSchema,
  recoveryId: nonEmptyText
});
export const RequestApprovalPayloadSchema = z.object({
  subjectType: ApprovalSubjectTypeSchema,
  subjectId: nonEmptyText,
  reason: nonEmptyText
});
export const DeployPayloadSchema = z.object({
  taskId: TaskIdSchema,
  approvalId: ApprovalIdSchema,
  attemptId: nonEmptyText
});

const commandAuditFields = {
  commandId: nonEmptyText,
  actor: ActorRefSchema,
  issuedAt: z.date(),
  availableAt: z.date(),
  correlationId: CorrelationIdSchema,
  causationId: EventIdSchema,
  claimedBy: z.string().nullable().optional(),
  claimedAt: z.date().nullable().optional(),
  completedAt: z.date().nullable().optional()
};

export const OutboxCommandSchema = z.discriminatedUnion('type', [
  z.object({
    ...commandAuditFields,
    type: z.literal('START_AGENT_SESSION'),
    payload: StartAgentSessionPayloadSchema
  }),
  z.object({
    ...commandAuditFields,
    type: z.literal('START_RECOVERY'),
    payload: StartRecoveryPayloadSchema
  }),
  z.object({
    ...commandAuditFields,
    type: z.literal('REQUEST_APPROVAL'),
    payload: RequestApprovalPayloadSchema
  }),
  z.object({
    ...commandAuditFields,
    type: z.literal('DEPLOY'),
    payload: DeployPayloadSchema
  })
]);
export type OutboxCommand = z.infer<typeof OutboxCommandSchema>;

export type EventActor = ActorRef;
export type EventCausationId = EventId;
