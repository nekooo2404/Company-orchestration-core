export class CircuitOpenError extends Error {
  public constructor(public readonly endpointId: string) {
    super(`Model endpoint circuit is open: ${endpointId}`);
    this.name = 'CircuitOpenError';
  }
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;

  public constructor(
    private readonly endpointId: string,
    private readonly threshold: number,
    private readonly resetMs: number,
    private readonly now: () => number = Date.now
  ) {
    if (!Number.isInteger(threshold) || threshold < 1 || resetMs < 1) throw new Error('Invalid circuit breaker configuration');
  }

  public assertClosed(): void {
    if (this.openedAt !== 0 && this.now() - this.openedAt < this.resetMs) throw new CircuitOpenError(this.endpointId);
    if (this.openedAt !== 0 && this.now() - this.openedAt >= this.resetMs) this.openedAt = 0;
  }

  public success(): void {
    this.failures = 0;
    this.openedAt = 0;
  }

  public failure(): void {
    this.failures += 1;
    if (this.failures >= this.threshold) this.openedAt = this.now();
  }
}
