export interface MetricsSink {
  increment(name: string, value: number, tags: Record<string, string>): void;
  observe(name: string, value: number, tags: Record<string, string>): void;
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
