import { z } from 'zod';
import {
  AgentDefinitionIdSchema,
  CorrelationIdSchema,
  TaskIdSchema,
  WorkflowIdSchema
} from './ids.js';

const nonEmptyText = z.string().refine((value) => value.trim().length > 0, {
  message: 'Value cannot be empty'
});

export const TaskStateSchema = z.enum([
  'PENDING',
  'READY',
  'RUNNING',
  'REVIEW',
  'COMPLETED',
  'BLOCKED',
  'RECOVERING',
  'FAILED',
  'ESCALATED_TO_CEO',
  'CANCELLED',
  'WAITING_FOR_APPROVAL'
]);
export type TaskState = z.infer<typeof TaskStateSchema>;

export const TaskBudgetSchema = z.object({
  maxTokens: z.number().int().nonnegative(),
  maxCostUsd: z.number().finite().nonnegative()
});
export type TaskBudget = z.infer<typeof TaskBudgetSchema>;

export const OutputContractSchema = nonEmptyText;
export type OutputContract = z.infer<typeof OutputContractSchema>;

export const CapabilityRequirementSchema = nonEmptyText;
export type CapabilityRequirement = z.infer<typeof CapabilityRequirementSchema>;

export const TaskSchema = z.object({
  id: TaskIdSchema,
  workflowId: WorkflowIdSchema,
  state: TaskStateSchema,
  dependencyIds: z.array(TaskIdSchema),
  requiredCapabilities: z.array(CapabilityRequirementSchema),
  outputContract: OutputContractSchema,
  budget: TaskBudgetSchema,
  recoveryCycles: z.number().int().min(0).max(5),
  projectId: nonEmptyText,
  parentTaskId: TaskIdSchema.nullable(),
  ownerAgentDefinitionId: AgentDefinitionIdSchema.nullable(),
  deadline: z.date().nullable(),
  traceId: CorrelationIdSchema,
  version: z.number().int().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date(),
  priority: z.number().int().optional(),
  title: nonEmptyText.optional(),
  description: z.string().optional(),
  isDeployment: z.boolean().optional(),
  deploymentApprovalId: nonEmptyText.optional(),
  deploymentAttemptId: nonEmptyText.optional()
});
export type Task = z.infer<typeof TaskSchema>;
