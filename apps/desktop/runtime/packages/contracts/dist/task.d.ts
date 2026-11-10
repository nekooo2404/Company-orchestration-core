import { z } from 'zod';
export declare const TaskStateSchema: z.ZodEnum<["PENDING", "READY", "RUNNING", "REVIEW", "COMPLETED", "BLOCKED", "RECOVERING", "FAILED", "ESCALATED_TO_CEO", "CANCELLED", "WAITING_FOR_APPROVAL"]>;
export type TaskState = z.infer<typeof TaskStateSchema>;
export declare const TaskBudgetSchema: z.ZodObject<{
    maxTokens: z.ZodNumber;
    maxCostUsd: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    maxTokens: number;
    maxCostUsd: number;
}, {
    maxTokens: number;
    maxCostUsd: number;
}>;
export type TaskBudget = z.infer<typeof TaskBudgetSchema>;
export declare const OutputContractSchema: z.ZodEffects<z.ZodString, string, string>;
export type OutputContract = z.infer<typeof OutputContractSchema>;
export declare const CapabilityRequirementSchema: z.ZodEffects<z.ZodString, string, string>;
export type CapabilityRequirement = z.infer<typeof CapabilityRequirementSchema>;
export declare const TaskSchema: z.ZodObject<{
    id: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
    workflowId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "WorkflowId";
    }, string>;
    state: z.ZodEnum<["PENDING", "READY", "RUNNING", "REVIEW", "COMPLETED", "BLOCKED", "RECOVERING", "FAILED", "ESCALATED_TO_CEO", "CANCELLED", "WAITING_FOR_APPROVAL"]>;
    dependencyIds: z.ZodArray<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>, "many">;
    requiredCapabilities: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
    outputContract: z.ZodEffects<z.ZodString, string, string>;
    budget: z.ZodObject<{
        maxTokens: z.ZodNumber;
        maxCostUsd: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        maxTokens: number;
        maxCostUsd: number;
    }, {
        maxTokens: number;
        maxCostUsd: number;
    }>;
    recoveryCycles: z.ZodNumber;
    projectId: z.ZodEffects<z.ZodString, string, string>;
    parentTaskId: z.ZodNullable<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
    ownerAgentDefinitionId: z.ZodNullable<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentDefinitionId";
    }, string>>;
    deadline: z.ZodNullable<z.ZodDate>;
    traceId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    version: z.ZodNumber;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    priority: z.ZodOptional<z.ZodNumber>;
    title: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    description: z.ZodOptional<z.ZodString>;
    isDeployment: z.ZodOptional<z.ZodBoolean>;
    deploymentApprovalId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    deploymentAttemptId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    id: string & {
        readonly __brand: "TaskId";
    };
    workflowId: string & {
        readonly __brand: "WorkflowId";
    };
    state: "PENDING" | "READY" | "RUNNING" | "REVIEW" | "COMPLETED" | "BLOCKED" | "RECOVERING" | "FAILED" | "ESCALATED_TO_CEO" | "CANCELLED" | "WAITING_FOR_APPROVAL";
    dependencyIds: (string & {
        readonly __brand: "TaskId";
    })[];
    requiredCapabilities: string[];
    outputContract: string;
    budget: {
        maxTokens: number;
        maxCostUsd: number;
    };
    recoveryCycles: number;
    projectId: string;
    parentTaskId: (string & {
        readonly __brand: "TaskId";
    }) | null;
    ownerAgentDefinitionId: (string & {
        readonly __brand: "AgentDefinitionId";
    }) | null;
    deadline: Date | null;
    traceId: string & {
        readonly __brand: "CorrelationId";
    };
    version: number;
    createdAt: Date;
    updatedAt: Date;
    priority?: number | undefined;
    title?: string | undefined;
    description?: string | undefined;
    isDeployment?: boolean | undefined;
    deploymentApprovalId?: string | undefined;
    deploymentAttemptId?: string | undefined;
}, {
    id: string;
    workflowId: string;
    state: "PENDING" | "READY" | "RUNNING" | "REVIEW" | "COMPLETED" | "BLOCKED" | "RECOVERING" | "FAILED" | "ESCALATED_TO_CEO" | "CANCELLED" | "WAITING_FOR_APPROVAL";
    dependencyIds: string[];
    requiredCapabilities: string[];
    outputContract: string;
    budget: {
        maxTokens: number;
        maxCostUsd: number;
    };
    recoveryCycles: number;
    projectId: string;
    parentTaskId: string | null;
    ownerAgentDefinitionId: string | null;
    deadline: Date | null;
    traceId: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    priority?: number | undefined;
    title?: string | undefined;
    description?: string | undefined;
    isDeployment?: boolean | undefined;
    deploymentApprovalId?: string | undefined;
    deploymentAttemptId?: string | undefined;
}>;
export type Task = z.infer<typeof TaskSchema>;
//# sourceMappingURL=task.d.ts.map