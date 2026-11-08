import { z } from 'zod';
import {
  ApprovalIdSchema,
  CorrelationIdSchema,
  EventIdSchema
} from './ids.js';
import { ActorRefSchema } from './agent.js';

const nonEmptyText = z.string().refine((value) => value.trim().length > 0);

export const ApprovalSubjectTypeSchema = z.enum([
  'CAPABILITY',
  'DEPLOYMENT',
  'RECOVERY_ESCALATION'
]);
export type ApprovalSubjectType = z.infer<typeof ApprovalSubjectTypeSchema>;

export const ApprovalStateSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED'
]);
export type ApprovalState = z.infer<typeof ApprovalStateSchema>;

export const ApprovalDecisionSchema = z.enum(['APPROVE', 'REJECT']);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

const approvalAuditFields = {
  approvalId: ApprovalIdSchema,
  subjectType: ApprovalSubjectTypeSchema,
  subjectId: z.string().refine((value) => value.trim().length > 0),
  reason: z.string().refine((value) => value.trim().length > 0),
  requestedBy: ActorRefSchema,
  correlationId: CorrelationIdSchema,
  causationId: EventIdSchema,
  version: z.number().int().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date()
};

export const ApprovalRecordSchema = z.discriminatedUnion('state', [
  z.object({
    ...approvalAuditFields,
    state: z.literal('PENDING'),
    decision: z.null(),
    decisionReason: z.null(),
    decidedBy: z.null(),
    decidedAt: z.null()
  }),
  z.object({
    ...approvalAuditFields,
    state: z.literal('APPROVED'),
    decision: z.literal('APPROVE'),
    decisionReason: nonEmptyText,
    decidedBy: ActorRefSchema,
    decidedAt: z.date()
  }),
  z.object({
    ...approvalAuditFields,
    state: z.literal('REJECTED'),
    decision: z.literal('REJECT'),
    decisionReason: nonEmptyText,
    decidedBy: ActorRefSchema,
    decidedAt: z.date()
  }),
  z.object({
    ...approvalAuditFields,
    state: z.literal('EXPIRED'),
    decision: z.null(),
    decisionReason: z.null(),
    decidedBy: ActorRefSchema,
    decidedAt: z.date()
  }),
  z.object({
    ...approvalAuditFields,
    state: z.literal('CANCELLED'),
    decision: z.null(),
    decisionReason: z.null(),
    decidedBy: ActorRefSchema,
    decidedAt: z.date()
  })
]);
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;
