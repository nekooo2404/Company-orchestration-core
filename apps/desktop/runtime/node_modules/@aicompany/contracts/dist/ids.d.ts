import { z } from 'zod';
type Brand<Name extends string> = string & {
    readonly __brand: Name;
};
export type WorkflowId = Brand<'WorkflowId'>;
export type TaskId = Brand<'TaskId'>;
export type AgentDefinitionId = Brand<'AgentDefinitionId'>;
export type AgentSessionId = Brand<'AgentSessionId'>;
export type EventId = Brand<'EventId'>;
export type ApprovalId = Brand<'ApprovalId'>;
export type CorrelationId = Brand<'CorrelationId'>;
export declare const workflowId: (value: string) => WorkflowId;
export declare const taskId: (value: string) => TaskId;
export declare const agentDefinitionId: (value: string) => AgentDefinitionId;
export declare const agentSessionId: (value: string) => AgentSessionId;
export declare const eventId: (value: string) => EventId;
export declare const approvalId: (value: string) => ApprovalId;
export declare const correlationId: (value: string) => CorrelationId;
export declare const WorkflowIdSchema: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, Brand<"WorkflowId">, string>;
export declare const TaskIdSchema: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, Brand<"TaskId">, string>;
export declare const AgentDefinitionIdSchema: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, Brand<"AgentDefinitionId">, string>;
export declare const AgentSessionIdSchema: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, Brand<"AgentSessionId">, string>;
export declare const EventIdSchema: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, Brand<"EventId">, string>;
export declare const ApprovalIdSchema: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, Brand<"ApprovalId">, string>;
export declare const CorrelationIdSchema: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, Brand<"CorrelationId">, string>;
export {};
//# sourceMappingURL=ids.d.ts.map