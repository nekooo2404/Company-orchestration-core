export declare class CircuitOpenError extends Error {
    readonly endpointId: string;
    constructor(endpointId: string);
}
export declare class CircuitBreaker {
    private readonly endpointId;
    private readonly threshold;
    private readonly resetMs;
    private readonly now;
    private failures;
    private openedAt;
    constructor(endpointId: string, threshold: number, resetMs: number, now?: () => number);
    assertClosed(): void;
    success(): void;
    failure(): void;
}
//# sourceMappingURL=circuit-breaker.d.ts.map