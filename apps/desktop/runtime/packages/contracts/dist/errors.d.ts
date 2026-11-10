import type { ZodIssue } from 'zod';
export declare class ContractValidationError extends Error {
    readonly issues: readonly ZodIssue[];
    readonly code = "CONTRACT_VALIDATION_ERROR";
    constructor(message: string, issues?: readonly ZodIssue[]);
}
export declare class ContractInvariantError extends Error {
    readonly code = "CONTRACT_INVARIANT_ERROR";
    constructor(message: string);
}
//# sourceMappingURL=errors.d.ts.map