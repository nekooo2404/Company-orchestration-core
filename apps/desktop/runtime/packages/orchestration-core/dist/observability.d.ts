import { type AgentSessionId, type CorrelationId, type EventId, type TaskId, type WorkflowId } from '@aicompany/contracts';
export { InMemoryMetricsSink, NoopMetricsSink, recordMetric } from './metrics.js';
export type { MetricsSink, RecordedMetric } from './metrics.js';
export type SpanAttribute = string | number | boolean;
export interface TraceContext {
    workflowId: WorkflowId;
    taskId?: TaskId;
    sessionId?: AgentSessionId;
    correlationId: CorrelationId;
    causationId?: EventId;
}
export interface SpanInput extends TraceContext {
    name: string;
    attributes: Record<string, SpanAttribute>;
}
export interface SpanHandle {
    end(attributes?: Record<string, SpanAttribute>): void;
    fail(error: Error): void;
}
export interface TraceSink {
    startSpan(input: SpanInput): SpanHandle;
}
export interface RecordedSpan extends SpanInput {
    status: 'open' | 'ended' | 'failed';
    startedAt: Date;
    endedAt?: Date;
    error?: {
        name: string;
        message: string;
    };
}
export declare class InMemoryTraceSink implements TraceSink {
    private readonly now;
    readonly spans: RecordedSpan[];
    constructor(now?: () => Date);
    startSpan(input: SpanInput): SpanHandle;
}
export declare const NoopTraceSink: TraceSink;
export declare const startSpanWithContext: (sink: TraceSink, context: TraceContext, name: string, attributes?: Record<string, SpanAttribute>) => SpanHandle;
//# sourceMappingURL=observability.d.ts.map