import { z } from 'zod';
export declare const ActorRefSchema: z.ZodUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"CEO">;
}, "strip", z.ZodTypeAny, {
    kind: "CEO";
}, {
    kind: "CEO";
}>, z.ZodObject<{
    kind: z.ZodLiteral<"AGENT">;
    sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
}, "strip", z.ZodTypeAny, {
    kind: "AGENT";
    sessionId: string & {
        readonly __brand: "AgentSessionId";
    };
}, {
    kind: "AGENT";
    sessionId: string;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"SYSTEM">;
    name: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    kind: "SYSTEM";
    name: string;
}, {
    kind: "SYSTEM";
    name: string;
}>]>;
export type ActorRef = z.infer<typeof ActorRefSchema>;
export declare const AgentSessionStateSchema: z.ZodEnum<["PENDING", "STARTING", "RUNNING", "WAITING_FOR_TOOL", "PAUSED", "RECOVERING", "COMPLETED", "FAILED", "CANCELLED", "TERMINATED", "REASSIGNED"]>;
export type AgentSessionState = z.infer<typeof AgentSessionStateSchema>;
export declare const RecoveryPolicySchema: z.ZodObject<{
    maxCycles: z.ZodNumber;
    allowedStrategies: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
}, "strip", z.ZodTypeAny, {
    maxCycles: number;
    allowedStrategies: string[];
}, {
    maxCycles: number;
    allowedStrategies: string[];
}>;
export type RecoveryPolicy = z.infer<typeof RecoveryPolicySchema>;
export declare const AgentDefinitionSchema: z.ZodObject<{
    id: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentDefinitionId";
    }, string>;
    role: z.ZodEffects<z.ZodString, string, string>;
    department: z.ZodEffects<z.ZodString, string, string>;
    supervisorId: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentDefinitionId";
    }, string>>>;
    mission: z.ZodEffects<z.ZodString, string, string>;
    persona: z.ZodEffects<z.ZodString, string, string>;
    systemPolicy: z.ZodEffects<z.ZodString, string, string>;
    preferredModel: z.ZodEffects<z.ZodString, string, string>;
    allowedCapabilities: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
    readableMemoryScopes: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
    writableMemoryScopes: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
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
    timeoutSeconds: z.ZodNumber;
    maxConcurrency: z.ZodNumber;
    recoveryPolicy: z.ZodObject<{
        maxCycles: z.ZodNumber;
        allowedStrategies: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
    }, "strip", z.ZodTypeAny, {
        maxCycles: number;
        allowedStrategies: string[];
    }, {
        maxCycles: number;
        allowedStrategies: string[];
    }>;
    outputContract: z.ZodEffects<z.ZodString, string, string>;
    version: z.ZodNumber;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string & {
        readonly __brand: "AgentDefinitionId";
    };
    outputContract: string;
    budget: {
        maxTokens: number;
        maxCostUsd: number;
    };
    version: number;
    createdAt: Date;
    updatedAt: Date;
    role: string;
    department: string;
    mission: string;
    persona: string;
    systemPolicy: string;
    preferredModel: string;
    allowedCapabilities: string[];
    readableMemoryScopes: string[];
    writableMemoryScopes: string[];
    timeoutSeconds: number;
    maxConcurrency: number;
    recoveryPolicy: {
        maxCycles: number;
        allowedStrategies: string[];
    };
    supervisorId?: (string & {
        readonly __brand: "AgentDefinitionId";
    }) | null | undefined;
}, {
    id: string;
    outputContract: string;
    budget: {
        maxTokens: number;
        maxCostUsd: number;
    };
    version: number;
    createdAt: Date;
    updatedAt: Date;
    role: string;
    department: string;
    mission: string;
    persona: string;
    systemPolicy: string;
    preferredModel: string;
    allowedCapabilities: string[];
    readableMemoryScopes: string[];
    writableMemoryScopes: string[];
    timeoutSeconds: number;
    maxConcurrency: number;
    recoveryPolicy: {
        maxCycles: number;
        allowedStrategies: string[];
    };
    supervisorId?: string | null | undefined;
}>;
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;
export declare const AgentSessionUsageSchema: z.ZodObject<{
    inputTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
    costUsd: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
}, {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
}>;
export type AgentSessionUsage = z.infer<typeof AgentSessionUsageSchema>;
export declare const AgentSessionSchema: z.ZodObject<{
    sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
    workflowId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "WorkflowId";
    }, string>;
    agentDefinitionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentDefinitionId";
    }, string>;
    state: z.ZodEnum<["PENDING", "STARTING", "RUNNING", "WAITING_FOR_TOOL", "PAUSED", "RECOVERING", "COMPLETED", "FAILED", "CANCELLED", "TERMINATED", "REASSIGNED"]>;
    contextReference: z.ZodEffects<z.ZodString, string, string>;
    checkpointReference: z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>;
    traceId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    usage: z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        costUsd: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
    }, {
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
    }>;
    toolCallHistory: z.ZodArray<z.ZodString, "many">;
    attempt: z.ZodOptional<z.ZodNumber>;
    version: z.ZodNumber;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    workflowId: string & {
        readonly __brand: "WorkflowId";
    };
    state: "PENDING" | "RUNNING" | "COMPLETED" | "RECOVERING" | "FAILED" | "CANCELLED" | "STARTING" | "WAITING_FOR_TOOL" | "PAUSED" | "TERMINATED" | "REASSIGNED";
    traceId: string & {
        readonly __brand: "CorrelationId";
    };
    version: number;
    createdAt: Date;
    updatedAt: Date;
    sessionId: string & {
        readonly __brand: "AgentSessionId";
    };
    taskId: string & {
        readonly __brand: "TaskId";
    };
    agentDefinitionId: string & {
        readonly __brand: "AgentDefinitionId";
    };
    contextReference: string;
    checkpointReference: string | null;
    usage: {
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
    };
    toolCallHistory: string[];
    attempt?: number | undefined;
}, {
    workflowId: string;
    state: "PENDING" | "RUNNING" | "COMPLETED" | "RECOVERING" | "FAILED" | "CANCELLED" | "STARTING" | "WAITING_FOR_TOOL" | "PAUSED" | "TERMINATED" | "REASSIGNED";
    traceId: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    sessionId: string;
    taskId: string;
    agentDefinitionId: string;
    contextReference: string;
    checkpointReference: string | null;
    usage: {
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
    };
    toolCallHistory: string[];
    attempt?: number | undefined;
}>;
export type AgentSession = z.infer<typeof AgentSessionSchema>;
//# sourceMappingURL=agent.d.ts.map