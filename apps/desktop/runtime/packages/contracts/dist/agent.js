import { z } from '../../../deps/zod/index.js';
import { AgentDefinitionIdSchema, AgentSessionIdSchema, CorrelationIdSchema, TaskIdSchema, WorkflowIdSchema } from './ids.js';
import { CapabilityRequirementSchema, OutputContractSchema, TaskBudgetSchema } from './task.js';
export const ActorRefSchema = z.union([
    z.object({ kind: z.literal('CEO') }),
    z.object({ kind: z.literal('AGENT'), sessionId: AgentSessionIdSchema }),
    z.object({ kind: z.literal('SYSTEM'), name: z.string().refine((value) => value.trim().length > 0) })
]);
export const AgentSessionStateSchema = z.enum([
    'PENDING',
    'STARTING',
    'RUNNING',
    'WAITING_FOR_TOOL',
    'PAUSED',
    'RECOVERING',
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'TERMINATED',
    'REASSIGNED'
]);
export const RecoveryPolicySchema = z.object({
    maxCycles: z.number().int().min(0).max(5),
    allowedStrategies: z.array(z.string().refine((value) => value.trim().length > 0))
});
export const AgentDefinitionSchema = z.object({
    id: AgentDefinitionIdSchema,
    role: z.string().refine((value) => value.trim().length > 0),
    department: z.string().refine((value) => value.trim().length > 0),
    supervisorId: AgentDefinitionIdSchema.nullable().optional(),
    mission: z.string().refine((value) => value.trim().length > 0),
    persona: z.string().refine((value) => value.trim().length > 0),
    systemPolicy: z.string().refine((value) => value.trim().length > 0),
    preferredModel: z.string().refine((value) => value.trim().length > 0),
    allowedCapabilities: z.array(CapabilityRequirementSchema),
    readableMemoryScopes: z.array(z.string().refine((value) => value.trim().length > 0)),
    writableMemoryScopes: z.array(z.string().refine((value) => value.trim().length > 0)),
    budget: TaskBudgetSchema,
    timeoutSeconds: z.number().int().positive(),
    maxConcurrency: z.number().int().positive(),
    recoveryPolicy: RecoveryPolicySchema,
    outputContract: OutputContractSchema,
    version: z.number().int().nonnegative(),
    createdAt: z.date(),
    updatedAt: z.date()
});
export const AgentSessionUsageSchema = z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costUsd: z.number().finite().nonnegative()
});
export const AgentSessionSchema = z.object({
    sessionId: AgentSessionIdSchema,
    taskId: TaskIdSchema,
    workflowId: WorkflowIdSchema,
    agentDefinitionId: AgentDefinitionIdSchema,
    state: AgentSessionStateSchema,
    contextReference: z.string().refine((value) => value.trim().length > 0),
    checkpointReference: z.string().refine((value) => value.trim().length > 0).nullable(),
    traceId: CorrelationIdSchema,
    usage: AgentSessionUsageSchema,
    toolCallHistory: z.array(z.string()),
    attempt: z.number().int().positive().optional(),
    version: z.number().int().nonnegative(),
    createdAt: z.date(),
    updatedAt: z.date()
});
//# sourceMappingURL=agent.js.map