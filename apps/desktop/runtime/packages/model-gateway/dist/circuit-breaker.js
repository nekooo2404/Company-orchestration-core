export class CircuitOpenError extends Error {
    endpointId;
    constructor(endpointId) {
        super(`Model endpoint circuit is open: ${endpointId}`);
        this.endpointId = endpointId;
        this.name = 'CircuitOpenError';
    }
}
export class CircuitBreaker {
    endpointId;
    threshold;
    resetMs;
    now;
    failures = 0;
    openedAt = 0;
    constructor(endpointId, threshold, resetMs, now = Date.now) {
        this.endpointId = endpointId;
        this.threshold = threshold;
        this.resetMs = resetMs;
        this.now = now;
        if (!Number.isInteger(threshold) || threshold < 1 || resetMs < 1)
            throw new Error('Invalid circuit breaker configuration');
    }
    assertClosed() {
        if (this.openedAt !== 0 && this.now() - this.openedAt < this.resetMs)
            throw new CircuitOpenError(this.endpointId);
        if (this.openedAt !== 0 && this.now() - this.openedAt >= this.resetMs)
            this.openedAt = 0;
    }
    success() {
        this.failures = 0;
        this.openedAt = 0;
    }
    failure() {
        this.failures += 1;
        if (this.failures >= this.threshold)
            this.openedAt = this.now();
    }
}
//# sourceMappingURL=circuit-breaker.js.map