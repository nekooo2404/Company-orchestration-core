import { z } from 'zod';
import { ApprovalIdSchema } from './ids';
import { ActorRefSchema } from './agent';

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

export const ApprovalRecordSchema = z.object({
  approvalId: ApprovalIdSchema,
  subjectType: ApprovalSubjectTypeSchema,
  subjectId: z.string().refine((value) => value.trim().length > 0),
  reason: z.string().refine((value) => value.trim().length > 0),
  requestedBy: ActorRefSchema,
  state: ApprovalStateSchema,
  decision: ApprovalDecisionSchema.nullable(),
  decidedBy: ActorRefSchema.nullable(),
  decidedAt: z.date().nullable().optional(),
  version: z.number().int().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date()
});
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;
