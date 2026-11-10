import type { AgentDefinitionId, AgentSessionId, CorrelationId, TaskId, WorkflowId } from '@aicompany/contracts';
import type { CostSink, UsageRecord } from '@aicompany/orchestration-core';
export interface ModelEndpointConfig {
    id: string;
    provider: string;
    baseUrl: string;
    model: string;
    credentialRef: string;
    headers?: Readonly<Record<string, string>>;
    timeoutMs: number;
    maxRetries: number;
    circuitFailureThreshold: number;
    circuitResetMs: number;
    inputCostPerMillionTokens?: number;
    outputCostPerMillionTokens?: number;
    allowInsecureLocalHttp?: boolean;
}
export interface SecretResolver {
    resolve(reference: string): Promise<string>;
}
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
}
export interface ModelRequest {
    workflowId: WorkflowId;
    taskId: TaskId;
    agentSessionId: AgentSessionId;
    agentDefinitionId: AgentDefinitionId;
    department: string;
    correlationId: CorrelationId;
    endpointId?: string;
    messages: readonly ChatMessage[];
    temperature?: number;
    maxTokens?: number;
}
export interface ModelResponse {
    requestId: string;
    endpointId: string;
    provider: string;
    model: string;
    content: string;
    finishReason: string | null;
    inputTokens: number;
    outputTokens: number;
    createdAt: Date;
}
export interface GatewayAuditRecord {
    requestId: string;
    endpointId: string;
    provider: string;
    model: string;
    status: 'SUCCESS' | 'ERROR' | 'CIRCUIT_OPEN';
    httpStatus?: number;
    attempts: number;
    durationMs: number;
    errorClass?: string;
}
export interface GatewayAuditSink {
    record(input: GatewayAuditRecord): Promise<void>;
}
export interface GatewayOptions {
    endpoints: readonly ModelEndpointConfig[];
    secrets: SecretResolver;
    audit?: GatewayAuditSink;
    usage?: CostSink;
    fetch?: typeof globalThis.fetch;
    sleep?: (milliseconds: number) => Promise<void>;
    idFactory?: () => string;
}
export interface HealthResult {
    endpointId: string;
    healthy: boolean;
    latencyMs: number;
    status?: number;
    reason?: string;
}
export interface ModelGateway {
    complete(input: ModelRequest): Promise<ModelResponse>;
    health(endpointId: string): Promise<HealthResult>;
}
export type UsageSink = Pick<CostSink, 'recordUsage'>;
export type ModelUsageRecord = UsageRecord;
//# sourceMappingURL=types.d.ts.map