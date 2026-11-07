import type { ZodIssue } from 'zod';

export class ContractValidationError extends Error {
  public readonly code = 'CONTRACT_VALIDATION_ERROR';

  public constructor(message: string, public readonly issues: readonly ZodIssue[] = []) {
    super(message);
    this.name = 'ContractValidationError';
  }
}

export class ContractInvariantError extends Error {
  public readonly code = 'CONTRACT_INVARIANT_ERROR';

  public constructor(message: string) {
    super(message);
    this.name = 'ContractInvariantError';
  }
}
