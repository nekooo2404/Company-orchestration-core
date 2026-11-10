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
export declare class InMemoryMetricsSink implements MetricsSink {
    readonly metrics: RecordedMetric[];
    increment(name: string, value: number, tags: Record<string, string>): void;
    observe(name: string, value: number, tags: Record<string, string>): void;
    private record;
}
export declare const NoopMetricsSink: MetricsSink;
export declare const recordMetric: (sink: MetricsSink, operation: "increment" | "observe", name: string, value: number, tags: Record<string, string>) => void;
//# sourceMappingURL=metrics.d.ts.map