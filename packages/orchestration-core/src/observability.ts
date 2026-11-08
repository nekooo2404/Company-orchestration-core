import {
  AgentSessionIdSchema,
  CorrelationIdSchema,
  EventIdSchema,
  TaskIdSchema,
  WorkflowIdSchema,
  type AgentSessionId,
  type CorrelationId,
  type EventId,
  type TaskId,
  type WorkflowId
} from '@aicompany/contracts';
import { normalizeFailure } from './failure-fingerprint.js';

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
  error?: { name: string; message: string };
}

const nonEmpty = (value: string, name: string): string => {
  if (value.trim().length === 0) throw new Error(`${name} cannot be empty`);
  return value.trim();
};

export class InMemoryTraceSink implements TraceSink {
  public readonly spans: RecordedSpan[] = [];

  public constructor(private readonly now: () => Date = () => new Date()) {}

  public startSpan(input: SpanInput): SpanHandle {
    const span: RecordedSpan = {
      name: nonEmpty(input.name, 'Span name'),
      workflowId: WorkflowIdSchema.parse(input.workflowId),
      correlationId: CorrelationIdSchema.parse(input.correlationId),
      attributes: { ...input.attributes },
      status: 'open',
      startedAt: new Date(this.now())
    };
    if (input.taskId !== undefined) span.taskId = TaskIdSchema.parse(input.taskId);
    if (input.sessionId !== undefined) span.sessionId = AgentSessionIdSchema.parse(input.sessionId);
    if (input.causationId !== undefined) span.causationId = EventIdSchema.parse(input.causationId);
    this.spans.push(span);
    const close = (status: 'ended' | 'failed', attributes?: Record<string, SpanAttribute>, error?: Error): void => {
      if (span.status !== 'open') return;
      span.status = status;
      span.endedAt = new Date(this.now());
      if (attributes !== undefined) Object.assign(span.attributes, attributes);
      if (error !== undefined) {
        const normalized = normalizeFailure({
          errorClass: error.name,
          commandName: 'trace.span',
          message: error.message
        });
        span.error = { name: error.name, message: normalized.message };
      }
    };
    return { end: (attributes) => close('ended', attributes), fail: (error) => close('failed', undefined, error) };
  }
}

export const NoopTraceSink: TraceSink = {
  startSpan: () => ({ end: () => {}, fail: () => {} })
};

export const startSpanWithContext = (
  sink: TraceSink,
  context: TraceContext,
  name: string,
  attributes: Record<string, SpanAttribute> = {}
): SpanHandle => sink.startSpan({
  ...context,
  name,
  attributes: { ...attributes }
});
