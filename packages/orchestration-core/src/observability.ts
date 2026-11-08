import {
  AgentSessionIdSchema,
  CorrelationIdSchema,
  TaskIdSchema,
  WorkflowIdSchema,
  type AgentSessionId,
  type CorrelationId,
  type TaskId,
  type WorkflowId
} from '@aicompany/contracts';

export type SpanAttribute = string | number | boolean;

export interface SpanInput {
  name: string;
  workflowId: WorkflowId;
  taskId?: TaskId;
  sessionId?: AgentSessionId;
  correlationId: CorrelationId;
  attributes: Record<string, SpanAttribute>;
}

export interface SpanHandle {
  end(attributes?: Record<string, SpanAttribute>): void;
  fail(error: Error): void;
}

export interface TraceSink {
  startSpan(input: SpanInput): SpanHandle;
}

export interface MetricsSink {
  increment(name: string, value: number, tags: Record<string, string>): void;
  observe(name: string, value: number, tags: Record<string, string>): void;
}

export interface RecordedSpan extends SpanInput {
  taskId?: TaskId;
  sessionId?: AgentSessionId;
  status: 'open' | 'ended' | 'failed';
  startedAt: Date;
  endedAt?: Date;
  error?: { name: string; message: string };
}

export interface RecordedMetric {
  kind: 'increment' | 'observe';
  name: string;
  value: number;
  tags: Record<string, string>;
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
    this.spans.push(span);
    const close = (status: 'ended' | 'failed', attributes?: Record<string, SpanAttribute>, error?: Error): void => {
      if (span.status !== 'open') return;
      span.status = status;
      span.endedAt = new Date(this.now());
      if (attributes !== undefined) Object.assign(span.attributes, attributes);
      if (error !== undefined) span.error = { name: error.name, message: error.message };
    };
    return { end: (attributes) => close('ended', attributes), fail: (error) => close('failed', undefined, error) };
  }
}

export const NoopTraceSink: TraceSink = {
  startSpan: () => ({ end: () => {}, fail: () => {} })
};

export class InMemoryMetricsSink implements MetricsSink {
  public readonly metrics: RecordedMetric[] = [];

  public increment(name: string, value: number, tags: Record<string, string>): void {
    this.record('increment', name, value, tags);
  }

  public observe(name: string, value: number, tags: Record<string, string>): void {
    this.record('observe', name, value, tags);
  }

  private record(kind: RecordedMetric['kind'], name: string, value: number, tags: Record<string, string>): void {
    this.metrics.push({ kind, name: nonEmpty(name, 'Metric name'), value, tags: { ...tags } });
  }
}

export const NoopMetricsSink: MetricsSink = { increment: () => {}, observe: () => {} };

export const recordMetric = (
  sink: MetricsSink,
  operation: 'increment' | 'observe',
  name: string,
  value: number,
  tags: Record<string, string>
): void => {
  try {
    sink[operation](name, value, tags);
  } catch {
    // Metrics are diagnostic and must not affect business operations.
  }
};
