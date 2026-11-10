const nonEmpty = (value, name) => {
    if (value.trim().length === 0)
        throw new Error(`${name} cannot be empty`);
    return value.trim();
};
export class InMemoryMetricsSink {
    metrics = [];
    increment(name, value, tags) {
        this.record('increment', name, value, tags);
    }
    observe(name, value, tags) {
        this.record('observe', name, value, tags);
    }
    record(kind, name, value, tags) {
        this.metrics.push({ kind, name: nonEmpty(name, 'Metric name'), value, tags: { ...tags } });
    }
}
export const NoopMetricsSink = { increment: () => { }, observe: () => { } };
export const recordMetric = (sink, operation, name, value, tags) => {
    try {
        sink[operation](name, value, tags);
    }
    catch {
        // Metrics are diagnostic and must not affect business operations.
    }
};
//# sourceMappingURL=metrics.js.map